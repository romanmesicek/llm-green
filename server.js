const express = require('express');
const path = require('path');
const { router, startWatching } = require('./src/routes');

const app = express();
const PORT = 3456;

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', router);

app.listen(PORT, () => {
  console.log(`Claude Green dashboard running at http://localhost:${PORT}`);
  startWatching();
});
