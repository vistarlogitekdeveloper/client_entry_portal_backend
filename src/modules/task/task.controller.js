const service = require('./task.service');

// GET /tasks
exports.getAll = async (req, res) => {
  try {
    const tasks = await service.getTasks(req.user, req.query);
    res.json({ success: true, data: tasks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /tasks
exports.create = async (req, res) => {
  try {
    const task = await service.createTask(req.user, req.body);
    res.status(201).json({ success: true, data: task });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PUT /tasks/:id
exports.update = async (req, res) => {
  try {
    const task = await service.updateTask(req.user, req.params.id, req.body);
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PATCH /tasks/:id/status
exports.updateStatus = async (req, res) => {
  try {
    const task = await service.updateStatus(req.user, req.params.id, req.body.status);
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// DELETE /tasks/:id
exports.remove = async (req, res) => {
  try {
    await service.deleteTask(req.user, req.params.id);
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// GET /tasks/pending-count  (for dashboard badge)
exports.pendingCount = async (req, res) => {
  try {
    const count = await service.getPendingCount(req.user.id);
    res.json({ success: true, data: { count } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
