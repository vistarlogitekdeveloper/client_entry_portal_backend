const pool = require('../../config/db');
const userService = require('../user/user.service');
const { sendPushNotification } = require('../../utils/notification.utils');

// ── Auto-migration: ensure created_by column exists ──────────────────────────
(async () => {
  try {
    await pool.query(`
      ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL
    `);
    console.log('[Task] Migration: created_by column ensured.');
  } catch (err) {
    console.warn('[Task] Migration warning:', err.message);
  }
})();


// ── Helpers ──────────────────────────────────────────────────────────────────
const isAdmin = (actor) => actor?.role?.toUpperCase() === 'ADMIN';

// ── GET tasks ─────────────────────────────────────────────────────────────────
// BD: own tasks only. Admin: all tasks with user info.
exports.getTasks = async (actor, filters = {}) => {
  const { status, priority, userId } = filters;

  const conditions = [];
  const values = [];

  if (!isAdmin(actor)) {
    // BD sees only their own
    conditions.push(`t.assigned_to = $${values.length + 1}`);
    values.push(actor.id);
  } else if (userId) {
    // Admin filtering by specific user
    conditions.push(`t.assigned_to = $${values.length + 1}`);
    values.push(userId);
  }

  if (status) {
    conditions.push(`t.status = $${values.length + 1}`);
    values.push(status.toUpperCase());
  }

  if (priority) {
    conditions.push(`t.priority = $${values.length + 1}`);
    values.push(priority.toUpperCase());
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(
    `SELECT
       t.id,
       t.title,
       t.description,
       t.status,
       t.priority,
       t.due_date,
       t.assigned_to,
       t.created_at,
       t.updated_at,
       u.name  AS assigned_to_name,
       c.name  AS created_by_name
     FROM tasks t
     JOIN  users u ON u.id = t.assigned_to
     LEFT JOIN users c ON c.id = t.created_by
     ${where}
     ORDER BY
       CASE t.priority WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END,
       t.due_date ASC NULLS LAST,
       t.created_at DESC`,
    values
  );

  return result.rows;
};

// ── CREATE task ───────────────────────────────────────────────────────────────
exports.createTask = async (actor, body) => {
  const { title, description, priority = 'MEDIUM', due_date, assigned_to } = body;
  if (!title?.trim()) throw new Error('Title is required');

  // Admin can assign to another user; everyone else assigns to self
  let assignedUserId = actor.id;
  if (isAdmin(actor) && assigned_to) {
    assignedUserId = assigned_to;
  }

  const result = await pool.query(
    `INSERT INTO tasks (title, description, priority, due_date, assigned_to, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      title.trim(),
      description?.trim() || null,
      priority.toUpperCase(),
      due_date || null,
      assignedUserId,
      actor.id,          // always the logged-in user
    ]
  );
  const task = result.rows[0];

  // Send FCM push notification to the assigned BD user (non-fatal)
  if (isAdmin(actor) && assigned_to && assigned_to !== actor.id) {
    try {
      const assignedUser = await userService.findOne(assigned_to);
      if (assignedUser?.fcm_token) {
        await sendPushNotification(
          assignedUser.fcm_token,
          '📋 New Task Assigned',
          `You have a new task: "${title.trim()}"`,
          { type: 'TASK_ASSIGNED', task_id: String(task.id) }
        );
      }
    } catch (notifErr) {
      console.warn('[Task] Notification failed (non-fatal):', notifErr.message);
    }
  }

  return task;
};

// ── UPDATE task ───────────────────────────────────────────────────────────────
exports.updateTask = async (actor, taskId, body) => {
  const { title, description, priority, due_date } = body;

  // BD can only edit own tasks
  const ownerFilter = isAdmin(actor) ? '' : 'AND assigned_to = $2';
  const ownerValues = isAdmin(actor) ? [taskId] : [taskId, actor.id];

  const existing = await pool.query(
    `SELECT * FROM tasks WHERE id = $1 ${ownerFilter}`,
    ownerValues
  );
  if (!existing.rows[0]) throw new Error('Task not found or access denied');

  const result = await pool.query(
    `UPDATE tasks SET
       title       = COALESCE($1, title),
       description = COALESCE($2, description),
       priority    = COALESCE($3, priority),
       due_date    = COALESCE($4, due_date),
       updated_at  = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING *`,
    [
      title?.trim() || null,
      description?.trim() || null,
      priority?.toUpperCase() || null,
      due_date || null,
      taskId,
    ]
  );
  return result.rows[0];
};

// ── UPDATE status ─────────────────────────────────────────────────────────────
// Only BD who owns the task can change status (admin view-only)
exports.updateStatus = async (actor, taskId, status) => {
  const validStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED'];
  const normalized = status?.toUpperCase();
  if (!validStatuses.includes(normalized)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  const ownerFilter = isAdmin(actor) ? '' : 'AND assigned_to = $3';
  const values = isAdmin(actor) ? [normalized, taskId] : [normalized, taskId, actor.id];

  const result = await pool.query(
    `UPDATE tasks
     SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 ${ownerFilter}
     RETURNING *`,
    values
  );

  if (!result.rows[0]) throw new Error('Task not found or access denied');
  return result.rows[0];
};

// ── DELETE task ───────────────────────────────────────────────────────────────
exports.deleteTask = async (actor, taskId) => {
  const ownerFilter = isAdmin(actor) ? '' : 'AND assigned_to = $2';
  const values = isAdmin(actor) ? [taskId] : [taskId, actor.id];

  const result = await pool.query(
    `DELETE FROM tasks WHERE id = $1 ${ownerFilter} RETURNING id`,
    values
  );
  if (!result.rows[0]) throw new Error('Task not found or access denied');
  return result.rows[0];
};

// ── STATS (for dashboard badge) ───────────────────────────────────────────────
exports.getPendingCount = async (userId) => {
  const result = await pool.query(
    `SELECT COUNT(*) AS count FROM tasks
     WHERE assigned_to = $1 AND status != 'COMPLETED'`,
    [userId]
  );
  return parseInt(result.rows[0]?.count || '0', 10);
};
