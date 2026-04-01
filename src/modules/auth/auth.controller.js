const service = require('./auth.service');

exports.login = async (req, res) => {
  try {
    const data = await service.login(
      req.body.email,
      req.body.password
    );

    res.json({
      success: true,
      data
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

exports.changePassword = async (req, res) => {
  try {
    await service.changePassword(
      req.user.id,
      req.body.oldPassword,
      req.body.newPassword
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};