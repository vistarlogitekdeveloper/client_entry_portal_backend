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