import React from 'react';
import styles from './SpecificationsTable.module.css';
import Papa from 'papaparse';

export default function SpecificationsTable({ specs }) {
  const handleExportCSV = () => {
    const csv = Papa.unparse(specs);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'specifications.csv';
    a.click();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={styles.tableBox}>
      <h2>Specifications</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Piece #</th>
            <th>Color</th>
            <th>Glass Type</th>
            <th>Quantity</th>
          </tr>
        </thead>
        <tbody>
          {specs.map((s, idx) => (
            <tr key={idx}>
              <td>{s.pieceNumber}</td>
              <td><span className={styles.swatch} style={{ background: s.color }} /></td>
              <td>{s.glassType}</td>
              <td>{s.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.actions}>
        <button onClick={handleExportCSV}>Export as CSV</button>
        <button onClick={handlePrint}>Print Work Order</button>
      </div>
    </div>
  );
}
