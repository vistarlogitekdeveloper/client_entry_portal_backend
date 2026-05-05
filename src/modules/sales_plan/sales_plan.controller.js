const service = require('./sales_plan.service');

/** GET /api/sales-plan?year=2026-2027
 *  Admin  → all users
 *  Others → own row only
 */
exports.getSheet = async (req, res) => {
  try {
    const fiscalYear = req.query.year || _currentFiscalYear();
    const role = (req.user.role || '').toUpperCase();

    if (role === 'ADMIN') {
      const rows = await service.getAllForYear(fiscalYear);
      // Also return the full user list so the admin can add missing rows
      const users = await service.getSalesUsers();
      return res.json({ success: true, data: { rows, users, fiscalYear } });
    }

    // Non-admin: return only own row
    const row = await service.getRowForUser(req.user.id, fiscalYear);
    return res.json({ success: true, data: { rows: row ? [row] : [], fiscalYear } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/** PUT /api/sales-plan/:userId?year=2026-2027
 *  Admin only — update plan/actual values for any user.
 */
exports.updateRow = async (req, res) => {
  try {
    const role = (req.user.role || '').toUpperCase();
    if (role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const userId = req.params.userId;
    const fiscalYear = req.query.year || _currentFiscalYear();
    const updated = await service.upsertRow(userId, fiscalYear, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/** DELETE /api/sales-plan/:userId?year=2026-2027
 *  Admin only — remove a user's row for the year.
 */
exports.deleteRow = async (req, res) => {
  try {
    const role = (req.user.role || '').toUpperCase();
    if (role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const userId = req.params.userId;
    const fiscalYear = req.query.year || _currentFiscalYear();
    const removed = await service.deleteRow(userId, fiscalYear);
    if (!removed) {
      return res.status(404).json({ success: false, message: 'Row not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/** GET /api/sales-plan/users  — Admin: list of BD/MANAGER users */
exports.getSalesUsers = async (req, res) => {
  try {
    const role = (req.user.role || '').toUpperCase();
    if (role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const users = await service.getSalesUsers();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

function _currentFiscalYear() {
  const now = new Date();
  // Indian fiscal year: April to March
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${year + 1}`;
}
