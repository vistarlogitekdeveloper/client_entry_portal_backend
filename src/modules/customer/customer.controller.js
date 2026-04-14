const service = require('./customer.service');

exports.create = async (req, res) => {
  try {
    const customer = await service.createCustomer(req.body, req.user);
    res.json({ success: true, data: customer });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const customers = await service.getCustomers(req.user, req.query.search);
    res.json({ success: true, data: customers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.approve = async (req, res) => {
  try {
    const customer = await service.approveCustomer(req.params.id, req.user);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    res.json({ success: true, data: customer });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};


exports.toggleActive = async (req, res) => {
  try {
    let { isActive } = req.body;

    // Support string booleans from client
    if (isActive === 'true') isActive = true;
    if (isActive === 'false') isActive = false;

    // Validate if provided
    if (isActive !== undefined && typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isActive must be a boolean or "true"/"false"' });
    }

    const customer = await service.toggleCustomerActive(req.params.id, isActive, req.user);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    res.json({ success: true, data: customer });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.exportExcel = async (req, res) => {
  try {
    const buffer = await service.exportToExcel(req.user, req.query.search);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=customers.xlsx');

    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
