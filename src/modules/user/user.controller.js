const service = require('./user.service');

exports.getAllUsers = async (req, res) => {
  try {
    const users = await service.getUsers(req.query.search);
    res.json({
      success: true,
      data: users
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

exports.getAdminUsers = async (req, res) => {
  try {
    const users = await service.getAllUsersAdmin();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const user = await service.createUser(req.body);
    res.json({ success: true, data: user, message: 'User created successfully' });
  } catch (err) {
    // Check for unique constraint violation on email
    if (err.code === '23505') {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const user = await service.updateUser(req.params.id, req.body);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: user, message: 'User updated successfully' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, message: 'Email already exists' });
    }
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await service.deleteUser(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.registerFcmToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'FCM token is required' });
    }
    const user = await service.updateFcmToken(req.user.id, token);
    res.json({ success: true, data: user, message: 'FCM token registered successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
