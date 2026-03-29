const service = require('./dashboard.service');

exports.getStats = async (req, res) => {
  try {
    const data = await service.getDashboardStats(req.user);
    res.json({
      success: true,
      data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

exports.getRegion = async (req, res) => {
  try {
    const data = await service.getRegionStats(req.user);
    res.json({
      success: true,
      data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};
