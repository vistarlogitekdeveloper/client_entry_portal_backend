const service = require('./lead.service');

// ✅ CREATE
exports.create = async (req, res) => {
  try {
    const lead = await service.createLead(req.body, req.user);
    res.json({ success: true, data: lead });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ✅ GET ALL (WITH FILTERS)
exports.getAll = async (req, res) => {
  try {
    const leads = await service.getLeads(req.query, req.user);
    res.json({ success: true, data: leads });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ GET ONE BY ID
exports.getById = async (req, res) => {
  try {
    const lead = await service.getLeadById(req.params.id, req.user);

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    res.json({ success: true, data: lead });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ UPDATE
exports.update = async (req, res) => {
  try {
    const lead = await service.updateLead(req.params.id, req.body, req.user);

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    res.json({ success: true, data: lead });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
