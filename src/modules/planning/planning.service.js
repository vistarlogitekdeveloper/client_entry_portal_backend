const pool = require('../../config/db');
const { isBD } = require('../../utils/role.utils');

const getWeekStartDate = (dateInput) => {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date');

  const day = d.getDay();
  const mondayOffset = (day + 6) % 7;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - mondayOffset);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

exports.addPlanning = async (data, actor) => {
  const weekStartDate = data.week_start_date ? getWeekStartDate(data.week_start_date) : null;

  if (!data.lead_id) throw new Error('lead_id is required');
  if (!weekStartDate) throw new Error('week_start_date is required');
  if (!data.plan_content) throw new Error('plan_content is required');

  const upsertPlanningSql = `
    INSERT INTO lead_planning (
      lead_id,
      week_start_date,
      plan_content,
      created_by
    )
    VALUES ($1, $2::date, $3, $4)
    ON CONFLICT (lead_id, week_start_date)
    DO UPDATE SET
      plan_content = EXCLUDED.plan_content,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;

  const values = [
    data.lead_id,
    weekStartDate,
    data.plan_content,
    actor?.id || null
  ];

  const result = await pool.query(upsertPlanningSql, values);
  return result.rows[0];
};

exports.getPlanningByLead = async (leadId, actor) => {
  const values = [leadId];
  let ownerFilter = '';

  if (isBD(actor)) {
    ownerFilter = 'AND lm.owner = $2';
    values.push(actor.id);
  }

  const result = await pool.query(
    `SELECT
      lp.*
     FROM lead_planning lp
     INNER JOIN lead_master lm ON lm.id = lp.lead_id
     WHERE lp.lead_id = $1
       ${ownerFilter}
     ORDER BY lp.week_start_date DESC`,
    values
  );

  return result.rows;
};
