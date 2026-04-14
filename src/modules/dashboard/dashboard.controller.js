const service = require('./dashboard.service');

exports.getStats = async (req, res) => {
  try {
    const { month, year } = req.query;
    
    const currentDate = new Date();
    // Parse query params, defaulting to 0 ("All Time")
    const filterMonth = (month !== undefined) ? parseInt(month) : 0;
    const filterYear = (year !== undefined) ? parseInt(year) : 0;

    const data = await service.getDashboardStats(req.user, filterMonth, filterYear);
    
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
exports.getHOSummary = async (req, res) => {
  try {
    const data = await service.getHODashboardStats();
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
