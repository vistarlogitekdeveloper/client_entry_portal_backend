const service = require('./dashboard.service');

exports.getStats = async (req, res) => {
  try {
    const { month, year } = req.query;
    
    // Parse strings to integers, fallback to current Date if missing
    const currentDate = new Date();
    const filterMonth = parseInt(month) || (currentDate.getMonth() + 1);
    const filterYear = parseInt(year) || currentDate.getFullYear();

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
