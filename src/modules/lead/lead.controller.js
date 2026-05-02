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

exports.getAllWonPublic = async (req, res) => {
  try {
    const leads = await service.getAllWonLeadsPublic();
    res.json({ success: true, data: leads, count: leads.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ GET ALL (WITH FILTERS)
exports.getAll = async (req, res) => {
  try {
    const { leads, stats } = await service.getLeads(req.query, req.user);
    res.json({ success: true, data: leads, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ UNIQUE CUSTOMER NAMES (company_name) for dropdowns / filters
exports.getUniqueCustomerNames = async (req, res) => {
  try {
    const names = await service.getUniqueCompanyNames(req.user);
    res.json({ success: true, data: names });
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

// ✅ GET LEAD FIELD CHANGE HISTORY
exports.getChanges = async (req, res) => {
  try {
    const changes = await service.getLeadChanges(req.params.id, req.user);
    res.json({ success: true, data: changes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ DELETE
exports.deleteLead = async (req, res) => {
  try {
    const lead = await service.deleteLead(req.params.id, req.user);

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    res.json({ success: true, message: 'Lead deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.exportExcel = async (req, res) => {
  try {
    const buffer = await service.exportLeadsToExcel(req.query, req.user);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=leads.xlsx');

    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ SNOOZE WEEKLY REMINDER (PATCH /leads/:id/snooze)
exports.snoozeReminder = async (req, res) => {
  try {
    const { snooze_until } = req.body; // null to clear, 'YYYY-MM-DD' to set
    const lead = await service.setSnooze(req.params.id, snooze_until, req.user);

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    res.json({ success: true, data: lead });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

