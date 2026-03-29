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

