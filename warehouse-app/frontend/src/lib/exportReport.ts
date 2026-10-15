import api from '../api/index';

/** Download the Excel report (picker sign-off sheet + order details) for a department and day. */
export async function downloadSignoffReport(dept: string, date: string) {
  try {
    const res = await api.get(`/orders/export-xlsx?date=${date}&department=${dept}`, { responseType: 'blob' });
    const name = `Picker_Signoff_${dept === 'assembly' ? 'Accessories' : 'Machinery'}_${date}.xlsx`;
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err: any) {
    // Error bodies come back as a Blob when responseType is 'blob'
    let msg = 'Export failed';
    try { msg = JSON.parse(await err.response.data.text()).error || msg; } catch { /* keep default */ }
    throw new Error(msg);
  }
}
