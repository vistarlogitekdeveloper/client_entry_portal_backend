const pool = require('../../config/db');
const { isBD } = require('../../utils/role.utils');

exports.getDashboardStats = async (actor) => {
  const whereClause = isBD(actor) ? 'WHERE owner = $1' : '';
  const params = isBD(actor) ? [actor.id] : [];

  const result = await pool.query(
    `
      SELECT
        COUNT(*) AS total_leads,
        COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active_leads,
        COUNT(*) FILTER (WHERE final_status = 'WON') AS won_leads,
        COUNT(*) FILTER (WHERE final_status = 'LOST') AS lost_leads,
        COALESCE(SUM(projected_value), 0) AS revenue_pipeline
      FROM lead_master
      ${whereClause}
    `,
    params
  );

  return result.rows[0];
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
