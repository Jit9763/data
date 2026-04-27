function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    
    // ... other actions (sendOTP, verifyOTP) stay the same ...

    if (p.action === "save") {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var mainSheet = ss.getSheetByName("DataEntry");
      var backupSheet = ss.getSheetByName("Sheet2");
      
      var data = mainSheet.getDataRange().getValues();
      var headers = data[0];
      var emailToFind = p.data[headers[0]].toString().toLowerCase().trim(); // Assuming first column is Email/ID
      
      var rowIndex = -1;
      for (var i = 1; i < data.length; i++) {
        if (data[i][0].toString().toLowerCase().trim() === emailToFind) {
          rowIndex = i + 1;
          // 1. BACKUP OLD DATA TO SHEET2
          var oldRow = data[i].slice();
          oldRow.push(new Date()); // Add Timestamp
          backupSheet.appendRow(oldRow);
          break;
        }
      }
      
      if (rowIndex !== -1) {
        // 2. UPDATE MAIN SHEET WITH NEW DATA
        var newRow = headers.map(function(h) { return p.data[h] || ""; });
        mainSheet.getRange(rowIndex, 1, 1, newRow.length).setValues([newRow]);
        return response({status: "success", message: "Updated and Backed up"});
      } else {
        // If not found, just append as new
        mainSheet.appendRow(headers.map(function(h) { return p.data[h] || ""; }));
        return response({status: "success", message: "New record added"});
      }
    }
  } catch(err) {
    return response({status: "error", message: err.toString()});
  }
}
