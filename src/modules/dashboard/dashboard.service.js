const pool = require('../../config/db');

exports.getDashboardStats = async (actor, filterMonth, filterYear) => {
  const isAllTime = (filterMonth === 0 || filterYear === 0);
  
  let commonWhere = '';
  let commonParams = [];

  if (!isAllTime) {
    commonWhere = `
      WHERE EXTRACT(MONTH FROM COALESCE(lead_received_date, created_at::date)) = $1 
        AND EXTRACT(YEAR FROM COALESCE(lead_received_date, created_at::date)) = $2
    `;
    commonParams = [filterMonth, filterYear];
  }

  const actorWhere = ''; // No role-based filtering — all users see full data

  const kpiQuery = `
    SELECT
      COUNT(*)::INTEGER AS total_leads,
      COUNT(*) FILTER (WHERE status = 'ACTIVE')::INTEGER AS active_leads,
      COUNT(*) FILTER (WHERE final_status = 'WON')::INTEGER AS won_leads,
      COUNT(*) FILTER (WHERE final_status = 'LOST')::INTEGER AS lost_leads,
      COALESCE(SUM(projected_value), 0)::NUMERIC AS total_pipeline_value,
      (SELECT COUNT(*)::INTEGER FROM lead_master) AS grand_total_leads
    FROM lead_master
    ${commonWhere} ${actorWhere}
  `;

  const leaderboardQuery = isAllTime 
    ? `
      SELECT
        u.id AS user_id,
        u.name AS bd_name,
        u.role,
        COUNT(lm.id)::INTEGER AS total_leads,
        COUNT(lm.id) FILTER (WHERE lm.final_status = 'WON')::INTEGER AS won_leads,
        COALESCE(SUM(lm.projected_value), 0)::NUMERIC AS total_value,
        (SELECT COUNT(*)::INTEGER FROM lead_review_reminders r WHERE r.notified_user_id = u.id AND r.status = 'PENDING') AS pending_updates
      FROM users u
      LEFT JOIN lead_master lm ON lm.owner = u.id
      WHERE u.role IN ('BD', 'MANAGER', 'ADMIN')
      GROUP BY u.id, u.name, u.role
      ORDER BY total_value DESC
    `
    : `
      SELECT
        u.id AS user_id,
        u.name AS bd_name,
        u.role,
        COUNT(lm.id)::INTEGER AS total_leads,
        COUNT(lm.id) FILTER (WHERE lm.final_status = 'WON')::INTEGER AS won_leads,
        COALESCE(SUM(lm.projected_value), 0)::NUMERIC AS total_value,
        (SELECT COUNT(*)::INTEGER FROM lead_review_reminders r WHERE r.notified_user_id = u.id AND r.status = 'PENDING') AS pending_updates
      FROM users u
      LEFT JOIN lead_master lm
        ON lm.owner = u.id
        AND EXTRACT(MONTH FROM COALESCE(lm.lead_received_date, lm.created_at::date)) = $1
        AND EXTRACT(YEAR FROM COALESCE(lm.lead_received_date, lm.created_at::date)) = $2
      WHERE u.role IN ('BD', 'MANAGER', 'ADMIN')
      GROUP BY u.id, u.name, u.role
      ORDER BY total_value DESC
    `;

  const regionQuery = `
    SELECT
      region,
      COUNT(*)::INTEGER AS total_leads,
      COALESCE(SUM(projected_value), 0)::NUMERIC AS revenue
    FROM lead_master
    ${commonWhere} ${actorWhere}
    GROUP BY region
    ORDER BY total_leads DESC
  `;

  const scopeQuery = `
    SELECT
      business_scope AS scope,
      COUNT(*)::INTEGER AS total_leads,
      COALESCE(SUM(projected_value), 0)::NUMERIC AS revenue
    FROM lead_master
    ${commonWhere} ${actorWhere}
    GROUP BY business_scope
    ORDER BY total_leads DESC
  `;

  const monthlyWhere = isAllTime 
    ? '' 
    : `WHERE EXTRACT(YEAR FROM COALESCE(lead_received_date, created_at::date)) = $1`;
  const monthlyParams = isAllTime ? [] : [filterYear];
  const monthlyActorWhere = ''; // No role-based filtering

  const trendsQuery = `
    SELECT
      TO_CHAR(COALESCE(lead_received_date, created_at::date), 'YYYY-MM') AS month,
      COUNT(*)::INTEGER AS total_leads,
      COUNT(*) FILTER (WHERE final_status = 'WON')::INTEGER AS won_leads,
      COALESCE(SUM(projected_value), 0)::NUMERIC AS revenue
    FROM lead_master
    ${monthlyWhere} ${monthlyActorWhere}
    GROUP BY TO_CHAR(COALESCE(lead_received_date, created_at::date), 'YYYY-MM')
    ORDER BY month ASC
  `;

  const leaderboardParams = isAllTime ? [] : [filterMonth, filterYear];

  const [
    kpiResult,
    leaderboardResult,
    regionResult,
    scopeResult,
    trendsResult
  ] = await Promise.all([
    pool.query(kpiQuery, commonParams),
    pool.query(leaderboardQuery, leaderboardParams),
    pool.query(regionQuery, commonParams),
    pool.query(scopeQuery, commonParams),
    pool.query(trendsQuery, monthlyParams)
  ]);

  const kpi = kpiResult.rows[0] || {
    total_leads: 0, active_leads: 0, won_leads: 0, lost_leads: 0, total_pipeline_value: 0, grand_total_leads: 0
  };
  
  kpi.conversion_rate = kpi.total_leads > 0 
    ? parseFloat(((kpi.won_leads / kpi.total_leads) * 100).toFixed(2)) : 0.0;
  
  kpi.average_deal_size = kpi.total_leads > 0 
    ? parseFloat((kpi.total_pipeline_value / kpi.total_leads).toFixed(2)) : 0.0;

  const leaderboard = leaderboardResult.rows.map(row => ({
    bd_name: row.bd_name,
    role: row.role,
    total_leads: row.total_leads,
    won_leads: row.won_leads,
    total_value: parseFloat(row.total_value),
    conversion_rate: row.total_leads > 0 
      ? parseFloat(((row.won_leads / row.total_leads) * 100).toFixed(2)) : 0,
    pending_updates: row.pending_updates
  }));

  leaderboard.sort((a, b) => b.total_value - a.total_value);

  const TOP_N = 3;

  let best_conversion = null;
  let highest_revenue = null;
  let most_leads = null;
  let best_overall = null;

  if (leaderboard.length > 0) {
    const sortedByConversion = [...leaderboard].sort((a, b) => b.conversion_rate - a.conversion_rate);
    const sortedByLeads = [...leaderboard].sort((a, b) => b.total_leads - a.total_leads);
    const sortedByRevenue = [...leaderboard].sort((a, b) => b.total_value - a.total_value);

    best_conversion = sortedByConversion.slice(0, TOP_N).map(p => ({
      bd_name: p.bd_name,
      conversion_rate: p.conversion_rate
    }));

    highest_revenue = sortedByRevenue.slice(0, TOP_N).map(p => ({
      bd_name: p.bd_name,
      total_value: p.total_value
    }));

    most_leads = sortedByLeads.slice(0, TOP_N).map(p => ({
      bd_name: p.bd_name,
      total_leads: p.total_leads
    }));

    // "Top performers" / best overall = top 3 by total pipeline revenue.
    best_overall = sortedByRevenue.slice(0, TOP_N).map(p => ({
      bd_name: p.bd_name,
      total_value: p.total_value,
      reason: "Highest overall pipeline revenue"
    }));
  }

  return {
    kpi: {
      total_leads: parseInt(kpi.total_leads),
      active_leads: parseInt(kpi.active_leads),
      won_leads: parseInt(kpi.won_leads),
      lost_leads: parseInt(kpi.lost_leads),
      total_pipeline_value: parseFloat(kpi.total_pipeline_value),
      conversion_rate: kpi.conversion_rate,
      average_deal_size: kpi.average_deal_size,
      grand_total_leads: parseInt(kpi.grand_total_leads)
    },
    top_performers: {
      best_overall,
      best_conversion,
      highest_revenue,
      most_leads,
      leaderboard
    },
    region_analysis: regionResult.rows.map(r => ({ ...r, revenue: parseFloat(r.revenue) })),
    business_scope: scopeResult.rows.map(r => ({ ...r, revenue: parseFloat(r.revenue) })),
    monthly_trends: trendsResult.rows.map(r => ({ ...r, revenue: parseFloat(r.revenue) }))
  };
};

exports.getRegionStats = async (actor) => {
  const whereClause = isBD(actor) ? 'WHERE owner = $1' : '';
  const params = isBD(actor) ? [actor.id] : [];

  const result = await pool.query(
    `
      SELECT
        region,
        COUNT(*) AS total_leads,
        COALESCE(SUM(projected_value), 0) AS revenue
      FROM lead_master
      ${whereClause}
      GROUP BY region
      ORDER BY total_leads DESC
    `,
    params
  );

  return result.rows;
};
exports.getHODashboardStats = async () => {
  const query = `
    SELECT
      -- Agreements
      (SELECT COUNT(*)::INTEGER FROM ho_agreements WHERE expiry_date > CURRENT_DATE AND expiry_date <= CURRENT_DATE + INTERVAL '30 days') AS ag_expiring_30,
      (SELECT COUNT(*)::INTEGER FROM ho_agreements WHERE expiry_date > CURRENT_DATE AND expiry_date <= CURRENT_DATE + INTERVAL '7 days') AS ag_expiring_7,
      (SELECT COUNT(*)::INTEGER FROM ho_agreements WHERE expiry_date = CURRENT_DATE) AS ag_expiring_today,
      (SELECT COUNT(*)::INTEGER FROM ho_agreements WHERE expiry_date < CURRENT_DATE) AS ag_expired,
      (SELECT COUNT(*)::INTEGER FROM ho_agreements WHERE expiry_date >= CURRENT_DATE) AS ag_pending,
      
      -- Cost Sheets
      (SELECT COUNT(*)::INTEGER FROM ho_cost_sheets WHERE expiry_date > CURRENT_DATE AND expiry_date <= CURRENT_DATE + INTERVAL '30 days') AS cs_expiring_30,
      (SELECT COUNT(*)::INTEGER FROM ho_cost_sheets WHERE expiry_date > CURRENT_DATE AND expiry_date <= CURRENT_DATE + INTERVAL '7 days') AS cs_expiring_7,
      (SELECT COUNT(*)::INTEGER FROM ho_cost_sheets WHERE expiry_date = CURRENT_DATE) AS cs_expiring_today,
      (SELECT COUNT(*)::INTEGER FROM ho_cost_sheets WHERE expiry_date < CURRENT_DATE) AS cs_expired,
      (SELECT COUNT(*)::INTEGER FROM ho_cost_sheets WHERE expiry_date >= CURRENT_DATE) AS cs_pending,
      
      -- Certifications
      (SELECT COUNT(*)::INTEGER FROM ho_certifications WHERE expiry_date > CURRENT_DATE AND expiry_date <= CURRENT_DATE + INTERVAL '30 days') AS cert_expiring_30,
      (SELECT COUNT(*)::INTEGER FROM ho_certifications WHERE expiry_date > CURRENT_DATE AND expiry_date <= CURRENT_DATE + INTERVAL '7 days') AS cert_expiring_7,
      (SELECT COUNT(*)::INTEGER FROM ho_certifications WHERE expiry_date = CURRENT_DATE) AS cert_expiring_today,
      (SELECT COUNT(*)::INTEGER FROM ho_certifications WHERE expiry_date < CURRENT_DATE) AS cert_expired,
      (SELECT COUNT(*)::INTEGER FROM ho_certifications WHERE expiry_date >= CURRENT_DATE) AS cert_pending
  `;
  
  const result = await pool.query(query);
  const row = result.rows[0];

  return {
    agreements: {
      expiring_30_days: row.ag_expiring_30 || 0,
      expiring_7_days: row.ag_expiring_7 || 0,
      expiring_today: row.ag_expiring_today || 0,
      expired: row.ag_expired || 0,
      pending: row.ag_pending || 0
    },
    cost_sheets: {
      expiring_30_days: row.cs_expiring_30 || 0,
      expiring_7_days: row.cs_expiring_7 || 0,
      expiring_today: row.cs_expiring_today || 0,
      expired: row.cs_expired || 0,
      pending: row.cs_pending || 0
    },
    certifications: {
      expiring_30_days: row.cert_expiring_30 || 0,
      expiring_7_days: row.cert_expiring_7 || 0,
      expiring_today: row.cert_expiring_today || 0,
      expired: row.cert_expired || 0,
      pending: row.cert_pending || 0
    }
  };
};
