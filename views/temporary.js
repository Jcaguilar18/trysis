app.post('/addstock', async (req, res) => {
  const { no, clustercode, incoming, outgoing, itemDescription } = req.body;

  try {
    // Check if the item with the given itemDescription exists in the database
    const checkResult = await db.query("SELECT * FROM item WHERE material_name = $1", [itemDescription]);

    if (checkResult.rows.length === 0) {
      res.status(400).send('Item not found');
      return;
    }

    // Parse incoming and outgoing as integers
    const parsedIncoming = parseInt(incoming, 10);
    const parsedOutgoing = parseInt(outgoing, 10);

    // Check if parsing is successful
    if (isNaN(parsedIncoming) || isNaN(parsedOutgoing)) {
      res.status(400).send('Invalid incoming or outgoing value');
      return;
    }

    // Fetch the available value from the item table
    const fetchAvailableQuery = `SELECT available FROM item WHERE material_name = $1`;
    const fetchAvailableResult = await db.query(fetchAvailableQuery, [itemDescription]);
    const available = fetchAvailableResult.rows[0].available;

    const fetchPriceQuery = `SELECT price FROM item WHERE material_name = $1`;
    const fetchPriceResult = await db.query(fetchPriceQuery, [itemDescription]);
    const current_price = fetchPriceResult.rows[0].available;

    // Calculate new available value
    let newAvailable = available + parsedIncoming - parsedOutgoing;

    if (newAvailable < 0) {
      newAvailable = 0;
    }

    // Update the item table
    const updateQuery = `
      UPDATE item
      SET beginning_inventory = $1,
          available = $2,
          total_outgoing = total_outgoing + $3,
          total_incoming = total_incoming + $4
      WHERE material_name = $5
    `;
    await db.query(updateQuery, [newAvailable, newAvailable, parsedOutgoing, parsedIncoming, itemDescription]);

    // If the user is authenticated, log the action
    if (req.isAuthenticated()) {
      const currentUser = req.user;
      const logDescription = `${currentUser.username} updated stock for item: ${itemDescription}`;
      const oldlogDescription = `${currentUser.username} updated stock for item: ${itemDescription}`;

      // Insert the log entry into the logs table
      await db.query(
        "INSERT INTO logs (username, description, trans_type, log_date, picture, logs_clustercode, logs_material_name, logs_available, incoming, outgoing, logs_price) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, $8, $9, $10, $11)",
        [currentUser.username, logDescription, 'Modified', currentUser.picture_url, clustercode, itemDescription, newAvailable, parsedOutgoing, parsedIncoming, current_price, 'Yes']
      );
    }

    res.redirect("/stock");
  } catch (err) {
    console.error('Error updating stock:', err);
    res.status(500).send('Internal Server Error');
  }
});