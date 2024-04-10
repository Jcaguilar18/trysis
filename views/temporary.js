app.post("/update-account", async (req, res) => {
    const { userId, username, password, role, status, firstname, lastname } = req.body;
    let logDescription = 'Account updated: '; // Initialize log description
  
    try {
      let updateFields = {
        username: username,
        role: role,
        status: status,
        firstname: firstname,
        lastname: lastname
      };
  
      if (password && password.trim() !== '') {
        const pepperedPassword = password + (process.env.PEPPER || '');
        const hashedPassword = await bcrypt.hash(pepperedPassword, saltRounds);
        updateFields.password = hashedPassword;
        logDescription += 'password changed, ';
      }
  
      const setClause = Object.keys(updateFields)
        .filter(key => updateFields[key] !== undefined && updateFields[key] !== '') // Make sure we don't update with empty strings
        .map((key, idx) => `${key} = $${idx + 1}`)
        .join(', ');
  
      const queryParams = Object.values(updateFields)
        .filter(value => value !== undefined && value !== '') // Filter out empty strings
        .concat(userId);
  
      const sqlQuery = `UPDATE users SET ${setClause} WHERE userid = $${queryParams.length}`;
  
      await db.query(sqlQuery, queryParams);
  
      // Add more details to log description based on fields updated
      if (updateFields.username) logDescription += `username to ${username}, `;
      if (updateFields.firstname) logDescription += `firstname to ${firstname}, `;
      if (updateFields.lastname) logDescription += `lastname to ${lastname}, `;
      if (updateFields.status) logDescription += `status to ${status}, `;
      logDescription = logDescription.slice(0, -2); // Remove the last comma and space
  
      // Assuming you have a way to get the current user's username and picture_url
      // Insert log entry
      await db.query(
        "INSERT INTO logs (username, description, trans_type, log_date, picture) VALUES ($1, $2, 'Account Updated', CURRENT_DATE, $3)",
        [req.user.username, logDescription, req.user.picture_url]
      );
  
      res.redirect("/manage");
    } catch (err) {
      console.error("Error updating account:", err);
      res.status(500).send("Internal Server Error");
    }
  });

  <% users.forEach((user, index) => { %>
    <form action="/update-account" method="POST" class="table">
      <div class="<%= index % 2 === 0 ? 'row' : 'row-even' %>">
          <input type="hidden" name="userId" value="<%= user.userid %>">
        <div class="cell">
          <input type="text" name="username" value="<%= user.username %>" readonly>
        </div>
        <div class="cell">
          <input type="password" id="password" name="password" placeholder="New Password" readonly>
          <input type="password" id="confirm_password" name="confirm_password" placeholder="Confirm Password" readonly>
        </div>
        <div class="cell">
          <select name="role" disabled>
            <option value="company" <%= user.role === 'company' ? 'selected' : '' %>>Company</option>
            <option value="warehouse" <%= user.role === 'warehouse' ? 'selected' : '' %>>Warehouse</option>
            <option value="manager" <%= user.role === 'manager' ? 'selected' : '' %>>Manager</option>
          </select>
        </div>
        <div class="cell">
          <% if (user.status === 'active') { %>
            <img src="./assets/green_dot.png" alt="Active" class="status-icon-active">
        <% } else if (user.status === 'inactive') { %>
            <img src="./assets/Basic_red_dot.png" alt="Inactive" class="status-icon-inactive">
        <% } %>
          <select name="status" disabled>
            <option value="active" <%= user.status === 'active' ? 'selected' : '' %>>Active</option>
            <option value="inactive" <%= user.status === 'inactive' ? 'selected' : '' %>>Inactive</option>
          </select>
        </div>
          <input type="hidden" name="firstname" value="<%= user.firstname %>" readonly>
          <input type="hidden" name="lastname" value="<%= user.lastname %>" readonly>
        <div class="cell">
        <button type="button" class="edit" onclick="enableEditing(this)">
            <img src="./assets/edit_icon_pencil.png" alt="Edit" class="edit-icon">
        </button>
        <button type="submit" class="hidden" onclick="return validatePassword();">Save</button>
    </div>
    </div>
  </form>
  <% }); %>