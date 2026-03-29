const isBD = (user) => String(user?.role || '').toUpperCase() === 'BD';

module.exports = {
  isBD
};
