app.get("/stock", async (req, res) => {
  const currentPage = req.query.page ? parseInt(req.query.page, 10) : 1;
  const classificationTypeFilter = req.query.trans_type || null;
  const itemsPerPage = 10;
  const offset = (currentPage - 1) * itemsPerPage;
  let itemsResult, countResult, totalItems, query;


  try {
    var roleOfQueryResult = await db.query("SELECT role FROM users WHERE username = $1", [req.session.username]);
    var roleOf = roleOfQueryResult.rows[0]?.role;

    if (classificationTypeFilter) {
      query = {
        text: "SELECT log_id, username, description, material_name, log_date, quantity, trans_type, picture FROM logs WHERE trans_type = $1 ORDER BY log_id DESC LIMIT $2 OFFSET $3",
        values: [transTypeFilter, logsPerPage, offset],
      };
      countResult = await db.query("SELECT COUNT(*) FROM logs WHERE trans_type = $1", [transTypeFilter]);
    } else {
      query = {
        text: "SELECT log_id, username, description, material_name, log_date, quantity, trans_type, picture FROM logs ORDER BY log_id DESC LIMIT $1 OFFSET $2",
        values: [logsPerPage, offset],
      };
      countResult = await db.query("SELECT COUNT(*) FROM logs");
    }
    
    var clusterquery = await db.query("SELECT * FROM cluster");
    const cluster = clusterquery.rows;

    var itemOfQueryResult = await db.query(`
      SELECT item.*, cluster.description as cluster_description 
      FROM item 
      INNER JOIN cluster ON item.clustercode = cluster.clustercode`);

    const items = itemOfQueryResult.rows;
    // console.log("testStock uname");
    //console.log(req.session.username);
    //  console.log("end /stock");
     
    res.render("stock.ejs", {items, roleOf, cluster});
  } catch (error) {
    console.error(`Error: ${error}`);
    res.status(500).send('An error occurred');
  }
});

/*
app.get("/logs/:page?", async (req, res) => {
  try {
    var roleOfQueryResult = await db.query("SELECT role FROM users WHERE username = $1", [req.session.username]);
    var roleOf = roleOfQueryResult.rows[0]?.role;

    var page = req.params.page || 1;
    var offset = (page - 1) * 5;

    var countQuery = await db.query("SELECT COUNT(*) FROM inventory");
    var totalRecords = countQuery.rows[0].count;
    var totalPages = Math.ceil(totalRecords / 5);
    
    var logsquery = await db.query("SELECT * FROM inventory ORDER BY changeid LIMIT 5 OFFSET $1", [offset]);
    const logs = logsquery.rows;

    console.log("testStock uname");
    console.log(req.session.username);
    console.log("end /logs");
     
    res.render("logs.ejs", {logs, roleOf, page, totalPages});
  } catch (error) {
    console.error(`Error: ${error}`);
    res.status(500).send('An error occurred');
  }
});
*/


app.get("/bin", async (req, res) => {
  var clustercode = req.query.clustercode;
  var itemOfQueryResult = await db.query(`
    SELECT item.*, cluster.description as cluster_description 
    FROM item 
    INNER JOIN cluster ON item.clustercode = cluster.clustercode 
    WHERE item.clustercode = $1`, [clustercode]);

  const items= itemOfQueryResult.rows;
  res.render("bin.ejs", {items});
});