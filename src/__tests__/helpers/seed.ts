import type Database from 'better-sqlite3';

export function seedTestData(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS ORDERDTL;
    DROP TABLE IF EXISTS ORDERHDR;
    DROP TABLE IF EXISTS INVNTRY;
    DROP TABLE IF EXISTS CUSTMAST;

    CREATE TABLE IF NOT EXISTS CUSTMAST (
      CUST_ID     TEXT    PRIMARY KEY,
      CUST_NAME   TEXT    NOT NULL,
      CUST_ADDR1  TEXT,
      CUST_CITY   TEXT,
      CUST_STATE  TEXT,
      CUST_ZIP    TEXT,
      CUST_PHONE  TEXT,
      CUST_CRDT   REAL    DEFAULT 0.00,
      CUST_STAT   TEXT    DEFAULT 'A',
      CUST_CRTD   TEXT,
      CUST_UPDT   TEXT
    );

    CREATE TABLE IF NOT EXISTS INVNTRY (
      ITEM_ID     TEXT    PRIMARY KEY,
      ITEM_DESC   TEXT    NOT NULL,
      ITEM_UOM    TEXT    DEFAULT 'EA',
      ITEM_QTY    INTEGER DEFAULT 0,
      ITEM_COST   REAL    DEFAULT 0.00,
      ITEM_PRICE  REAL    DEFAULT 0.00,
      ITEM_WHSE   TEXT    DEFAULT 'MAIN',
      ITEM_STAT   TEXT    DEFAULT 'A'
    );

    CREATE TABLE IF NOT EXISTS ORDERHDR (
      ORDR_ID     TEXT    PRIMARY KEY,
      CUST_ID     TEXT    NOT NULL REFERENCES CUSTMAST(CUST_ID),
      ORDR_DATE   TEXT    NOT NULL,
      ORDR_SHIP   TEXT,
      ORDR_STAT   TEXT    DEFAULT 'O',
      ORDR_TOTAL  REAL    DEFAULT 0.00,
      ORDR_NOTES  TEXT
    );

    CREATE TABLE IF NOT EXISTS ORDERDTL (
      DTAIL_ID    TEXT    PRIMARY KEY,
      ORDR_ID     TEXT    NOT NULL REFERENCES ORDERHDR(ORDR_ID),
      ITEM_ID     TEXT    NOT NULL REFERENCES INVNTRY(ITEM_ID),
      DTAIL_QTY   INTEGER DEFAULT 1,
      DTAIL_UPRC  REAL    DEFAULT 0.00,
      DTAIL_EXT   REAL    DEFAULT 0.00
    );
  `);

  const insertCustomer = db.prepare(`
    INSERT INTO CUSTMAST (CUST_ID, CUST_NAME, CUST_ADDR1, CUST_CITY, CUST_STATE,
      CUST_ZIP, CUST_PHONE, CUST_CRDT, CUST_STAT, CUST_CRTD, CUST_UPDT)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const today = '20240101';

  const customers: Array<[string, string, string, string, string, string, string, number, string, string, string]> = [
    ['C0001', 'ACME MANUFACTURING INC', '100 INDUSTRIAL BLVD', 'DETROIT', 'MI', '48201', '3135550100', 500000, 'A', '19950315', today],
    ['C0002', 'GREAT LAKES STEEL CO', '450 MILL RD', 'CLEVELAND', 'OH', '44101', '2165550200', 750000, 'A', '19980602', today],
    ['C0003', 'MIDWEST GRAIN ELEVATOR', '22 SILO RD', 'OMAHA', 'NE', '68101', '4025550300', 200000, 'A', '20010910', today],
    ['C0004', 'HEARTLAND LOGISTICS LLC', '9 FREIGHT WAY', 'CHICAGO', 'IL', '60601', '3125550400', 350000, 'A', '20050714', today],
    ['C0005', 'NORTHERN PAPER MILLS', '77 PULP AVE', 'GREEN BAY', 'WI', '54301', '9205550500', 125000, 'I', '19991120', today],
  ];

  const insertCustomers = db.transaction((rows: typeof customers) => {
    for (const row of rows) insertCustomer.run(...row);
  });
  insertCustomers(customers);

  const insertItem = db.prepare(`
    INSERT INTO INVNTRY (ITEM_ID, ITEM_DESC, ITEM_UOM, ITEM_QTY, ITEM_COST, ITEM_PRICE, ITEM_WHSE, ITEM_STAT)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const inventory: Array<[string, string, string, number, number, number, string, string]> = [
    ['ITM-001', 'COLD ROLLED STEEL SHEET 4X8', 'SHT', 2400, 42.50, 65.00, 'MAIN', 'A'],
    ['ITM-002', 'HOT ROLLED STEEL COIL 48IN', 'CL', 180, 1250.00, 1800.00, 'MAIN', 'A'],
    ['ITM-003', 'ALUMINUM EXTRUSION 6061 T6', 'FT', 8500, 3.20, 5.50, 'MAIN', 'A'],
    ['ITM-004', 'HDPE PIPE 2IN SCH40 10FT', 'PC', 600, 12.75, 22.00, 'WHSE2', 'A'],
    ['ITM-005', 'STAINLESS BOLT M12 SS316', 'BX', 3200, 0.85, 1.75, 'MAIN', 'A'],
    ['ITM-006', 'CONVEYOR BELT RUBBER 24IN', 'FT', 450, 18.40, 32.00, 'WHSE2', 'A'],
    ['ITM-007', 'INDUSTRIAL LUBRICANT 5GAL', 'PL', 220, 45.00, 78.00, 'MAIN', 'A'],
    ['ITM-008', 'CARBON FILTER CARTRIDGE', 'EA', 90, 62.00, 110.00, 'MAIN', 'A'],
  ];

  const insertInventory = db.transaction((rows: typeof inventory) => {
    for (const row of rows) insertItem.run(...row);
  });
  insertInventory(inventory);

  const insertOrder = db.prepare(`
    INSERT INTO ORDERHDR (ORDR_ID, CUST_ID, ORDR_DATE, ORDR_SHIP, ORDR_STAT, ORDR_TOTAL, ORDR_NOTES)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDetail = db.prepare(`
    INSERT INTO ORDERDTL (DTAIL_ID, ORDR_ID, ITEM_ID, DTAIL_QTY, DTAIL_UPRC, DTAIL_EXT)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    insertOrder.run('ORD-20240001', 'C0001', '20240103', '20240110', 'C', 8580.00, 'NET 30');
    insertDetail.run('DTL-00000001', 'ORD-20240001', 'ITM-001', 100, 65.00, 6500.00);
    insertDetail.run('DTL-00000002', 'ORD-20240001', 'ITM-005', 1200, 1.75, 2080.00);

    insertOrder.run('ORD-20240002', 'C0002', '20240115', '20240122', 'C', 5400.00, 'FOB ORIGIN');
    insertDetail.run('DTL-00000003', 'ORD-20240002', 'ITM-002', 3, 1800.00, 5400.00);

    insertOrder.run('ORD-20240003', 'C0004', '20240201', null, 'O', 3750.00, 'RUSH ORDER');
    insertDetail.run('DTL-00000004', 'ORD-20240003', 'ITM-006', 100, 32.00, 3200.00);
    insertDetail.run('DTL-00000005', 'ORD-20240003', 'ITM-007', 7, 78.00, 546.00);

    insertOrder.run('ORD-20240004', 'C0003', '20240210', '20240217', 'O', 2310.00, null);
    insertDetail.run('DTL-00000006', 'ORD-20240004', 'ITM-004', 60, 22.00, 1320.00);
    insertDetail.run('DTL-00000007', 'ORD-20240004', 'ITM-008', 9, 110.00, 990.00);
  })();
}
