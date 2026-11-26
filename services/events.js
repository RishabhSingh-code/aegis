const clients = new Set();

exports.addClient = (res) => clients.add(res);
exports.removeClient = (res) => clients.delete(res);
exports.broadcast = (msg) => {
  const data = `data: ${JSON.stringify(msg)}\n\n`;
  clients.forEach((c) => c.write(data));
};