const service = require('./planning.service');

exports.add = async (req, res) => {
  try {
    const planning = await service.addPlanning(req.body, req.user);
    res.json({
      success: true,
      data: planning
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

exports.getByLead = async (req, res) => {
  try {
    const planning = await service.getPlanningByLead(req.params.leadId, req.user);
    res.json({
      success: true,
      data: planning
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};
