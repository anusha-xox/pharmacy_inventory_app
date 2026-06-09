let user=null, medicines=[], alertsCache={}, cart=[], selected=null, lastBill=null, editingMedId=null;
const $=id=>document.getElementById(id), money=n=>'₹'+Number(n||0).toFixed(2), api=(url,opt={})=>fetch(url,{headers:{'Content-Type':'application/json'},...opt}).then(async r=>{const data=await r.json().catch(()=>({})); if(!r.ok) throw new Error(data.detail||'Request failed'); return data});
function toast(msg){$('toast').textContent=msg;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',3200)}
function fd(form){return Object.fromEntries(new FormData(form).entries())}
async function login(){try{user=await api('/api/login',{method:'POST',body:JSON.stringify({username:$('loginUser').value,password:$('loginPass').value,role:$('loginRole').value})});$('loginScreen').classList.remove('active');$('appScreen').classList.add('active');document.body.className=user.role==='desk'?'desk':'';$('who').textContent=`${user.name} • ${user.role}`;$('adminNav').classList.toggle('hidden',user.role!=='admin');$('deskNav').classList.toggle('hidden',user.role!=='desk');document.querySelectorAll('.admin-page').forEach(x=>x.style.display=user.role==='admin'||x.id==='billHistoryPage'?'':'none');document.querySelectorAll('.desk-page').forEach(x=>x.style.display=user.role==='desk'?'':'none');await refreshAll();go(user.role==='admin'?'adminDashboard':'newBillPage')}catch(e){toast(e.message)}}
function logout(){location.reload()}
function go(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const page=$(id);
  if(!page){toast('Screen not found: '+id); return;}
  page.classList.add('active');
  $('appTitle').textContent=page.querySelector('h2')?.textContent||'Pharmacy';
  if(id==='reportsPage') setTimeout(loadReports,80);
  if(id==='billHistoryPage'){
    const el=$('billHistory');
    if(el) el.innerHTML='<p class="muted">Loading bills...</p>';
    setTimeout(loadBills,80);
  }
}
async function refreshAll(){await Promise.all([loadMedicines(),loadAlerts(),loadReports(),loadMovements(),loadUsers(),loadBills()]).catch(()=>{});loadBillingMedicines();}
async function loadMedicines(){medicines=await api('/api/medicines?include_inactive=1&q='+encodeURIComponent($('adminSearch')?.value||''));$('mTotal').textContent=medicines.filter(m=>m.is_active).length;renderMedicines();$('stockMedicine').innerHTML=medicines.filter(m=>m.is_active).map(m=>`<option value="${m.medicine_id}">${m.name} ${m.strength||''}</option>`).join('')}
function renderMedicines(){const el=$('medicineList'); if(!el)return; el.innerHTML=medicines.map(m=>`<div class="item"><div><b>${m.name} ${m.strength||''}</b><p>${m.category||''} • ${m.manufacturer||''}<br/>Stock: <b>${m.total_stock}</b> • Exp: ${m.nearest_expiry||'-'} • Price: ${money(m.unit_price)}</p><span class="pill ${m.is_active?'':'red'}">${m.is_active?'Active':'Inactive'}</span></div><div class="actions"><button onclick="editMed(${m.medicine_id})">Edit</button><button onclick="toggleMed(${m.medicine_id})">${m.is_active?'Disable':'Enable'}</button></div></div>`).join('')||'<p class="muted">No medicines found.</p>'}
function showMedicineForm(){editingMedId=null;$('medFormTitle').textContent='Add Medicine';$('medicineForm').reset();$('medicineForm').is_active.value='1';go('medicineFormPage')}
function editMed(id){const m=medicines.find(x=>x.medicine_id===id);editingMedId=id;$('medFormTitle').textContent='Edit Medicine';Object.entries(m).forEach(([k,v])=>{if($('medicineForm')[k])$('medicineForm')[k].value=v??''});go('medicineFormPage')}
async function toggleMed(id){await api(`/api/medicines/${id}/toggle`,{method:'PATCH'});toast('Medicine status updated');loadMedicines()}
$('medicineForm').onsubmit=async e=>{e.preventDefault();let data=fd(e.target);data.unit_price=+data.unit_price;data.reorder_level=+data.reorder_level;data.is_active=+data.is_active;await api(editingMedId?`/api/medicines/${editingMedId}`:'/api/medicines',{method:editingMedId?'PUT':'POST',body:JSON.stringify(data)});toast('Medicine saved');await loadMedicines();go('medicinesPage')}
$('stockForm').onsubmit=async e=>{e.preventDefault();let data=fd(e.target);data.medicine_id=+data.medicine_id;data.quantity_available=+data.quantity_available;data.purchase_price=+data.purchase_price||0;data.created_by=user.user_id;await api('/api/batches',{method:'POST',body:JSON.stringify(data)});toast('Stock saved');e.target.reset();await refreshAll();go('adminDashboard')}
async function loadAlerts(){alertsCache=await api('/api/alerts');$('mLow').textContent=alertsCache.low_stock?.length||0;$('mExp').textContent=alertsCache.expiring_soon?.length||0;renderAlerts('expiring_soon')}
function renderAlerts(type,btn){if(btn){document.querySelectorAll('.seg button').forEach(b=>b.classList.remove('active'));btn.classList.add('active')}const rows=alertsCache[type]||[];$('alertsList').innerHTML=rows.map(x=> type==='low_stock'?`<div class="item"><div><b>${x.name} ${x.strength||''}</b><p>Total stock: ${x.total_stock} • Reorder level: ${x.reorder_level}</p></div><span class="pill red">Low</span></div>`:`<div class="item"><div><b>${x.name} ${x.strength||''}</b><p>Batch: ${x.batch_no} • Qty: ${x.quantity_available}<br/>Expiry: ${x.expiry_date}</p></div><span class="pill ${type==='expired'?'red':'orange'}">${type==='expired'?'Expired':'Expiring'}</span></div>`).join('')||'<p class="muted">No alerts.</p>'}
async function loadReports(){const r=await api('/api/reports');$('mSales').textContent=money(r.summary.total_sales);$('rSales').textContent=money(r.summary.total_sales);$('rBills').textContent=r.summary.total_bills;$('rAvg').textContent=money(r.summary.avg_bill);$('rItems').textContent=r.top_medicines.reduce((a,b)=>a+b.qty,0);$('topMeds').innerHTML=r.top_medicines.map(x=>`<div class="item"><b>${x.medicine}</b><span class="pill">${x.qty} sold</span></div>`).join('')||'<p class="muted">No sales yet.</p>';const charts=r.charts||{};drawChart('salesChartDay',charts.today||[],{kind:'bar',empty:'No sales today yet.'});drawChart('salesChartWeek',charts.week||r.daily||[],{kind:'line',empty:'No sales this week yet.'});drawChart('salesChartMonth',charts.month||[],{kind:'line',empty:'No sales this month yet.',skipLabels:4})}
function drawChart(canvasId,data,opt={}){
  const c=$(canvasId); if(!c)return;
  const cssW=Math.max(c.clientWidth||c.parentElement?.clientWidth||360,280), cssH=210;
  c.width=cssW*2; c.height=cssH*2; c.style.height=cssH+'px';
  const ctx=c.getContext('2d'); ctx.setTransform(2,0,0,2,0,0); ctx.clearRect(0,0,cssW,cssH);
  ctx.font='12px sans-serif'; ctx.fillStyle='#64748b';
  if(!data || !data.length || data.every(d=>Number(d.sales||0)===0)){ctx.fillText(opt.empty||'No sales data yet. Generate bills to see this graph.',22,55); return;}
  const vals=data.map(d=>Number(d.sales||0)), max=Math.max(...vals,1);
  const left=52, right=16, top=22, bottom=42, chartW=cssW-left-right, chartH=cssH-top-bottom;
  ctx.strokeStyle='#e5e7eb'; ctx.lineWidth=1;
  for(let i=0;i<4;i++){let y=top+i*(chartH/3);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(cssW-right,y);ctx.stroke();}
  ctx.fillStyle='#64748b'; ctx.font='11px sans-serif';ctx.fillText(money(max),6,top+4);ctx.fillText('₹0',18,top+chartH+4);
  const step=chartW/Math.max(data.length-1,1);
  if(opt.kind==='bar'){
    const barW=Math.max(4,Math.min(18,chartW/Math.max(data.length,1)*0.62));
    data.forEach((d,i)=>{let x=left+i*step-barW/2, h=(Number(d.sales||0)/max)*chartH, y=top+chartH-h;ctx.fillStyle='#0f8b75';ctx.fillRect(x,y,barW,h||1);});
  }else{
    ctx.strokeStyle='#0f62fe'; ctx.lineWidth=3; ctx.beginPath();
    data.forEach((d,i)=>{let x=left+i*step, y=top+chartH-(Number(d.sales||0)/max)*chartH; i?ctx.lineTo(x,y):ctx.moveTo(x,y);}); ctx.stroke();
    data.forEach((d,i)=>{let x=left+i*step, y=top+chartH-(Number(d.sales||0)/max)*chartH; ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fillStyle='#0f62fe';ctx.fill();});
  }
  ctx.fillStyle='#475569'; ctx.font='10px sans-serif';
  const skip=opt.skipLabels||((data.length<=8)?1:Math.ceil(data.length/6));
  data.forEach((d,i)=>{let x=left+i*step; if(i%skip===0 || i===data.length-1) ctx.fillText(String(d.label||d.day||''),Math.max(2,Math.min(x-14,cssW-48)),cssH-14);});
}
async function loadMovements(){const rows=await api('/api/stock-movements');$('recentStock').innerHTML=rows.slice(0,5).map(m=>`<div class="item"><div><b>${m.name} ${m.strength||''}</b><p>${m.movement_type} • Batch ${m.batch_no||'-'} • ${m.created_at}</p></div><span class="pill ${m.quantity_change<0?'orange':''}">${m.quantity_change}</span></div>`).join('');$('movementList').innerHTML=rows.map(m=>`<div class="item"><div><b>${m.name} ${m.strength||''}</b><p>${m.movement_type} • Batch ${m.batch_no||'-'} • By ${m.created_by_name||'-'}<br/>${m.created_at}</p></div><b class="${m.quantity_change<0?'danger':'price'}">${m.quantity_change}</b></div>`).join('')}
async function loadUsers(){const rows=await api('/api/users');$('userList').innerHTML=rows.map(u=>`<div class="item"><div><b>${u.name}</b><p>${u.username} • ${u.role}</p><span class="pill ${u.is_active?'':'red'}">${u.is_active?'Active':'Inactive'}</span></div><button onclick="toggleUser(${u.user_id})">Toggle</button></div>`).join('')}
$('userForm').onsubmit=async e=>{e.preventDefault();await api('/api/users',{method:'POST',body:JSON.stringify(fd(e.target))});toast('User added');e.target.reset();loadUsers()}
async function toggleUser(id){await api(`/api/users/${id}/toggle`,{method:'PATCH'});loadUsers()}
async function loadBillingMedicines(){const q=$('deskSearch')?.value||'';const rows=await api('/api/medicines?q='+encodeURIComponent(q));$('billingList').innerHTML=rows.filter(x=>x.total_stock>0).map(m=>`<div class="item" onclick="selectMed(${m.medicine_id})"><div><b>${m.name} ${m.strength||''}</b><p>${m.category||''}<br/>${money(m.unit_price)}</p></div><span class="pill">Stock: ${m.total_stock}</span></div>`).join('')||'<p class="muted">No available stock.</p>'}
async function selectMed(id){selected=medicines.find(m=>m.medicine_id===id)||await api('/api/medicines?q=').then(ms=>ms.find(m=>m.medicine_id===id));$('selectedMed').innerHTML=`<div class="card"><b>${selected.name} ${selected.strength||''}</b><p>${selected.category||''}<br/>Price: ${money(selected.unit_price)} • Stock: ${selected.total_stock}</p></div>`;const batches=await api(`/api/medicines/${id}/batches`);$('billBatch').innerHTML='<option value="">Auto FEFO - earliest expiry first</option>'+batches.map(b=>`<option value="${b.batch_id}">${b.batch_no} • Exp ${b.expiry_date} • Available ${b.quantity_available}</option>`).join('');$('billQty').value=1;go('addBillPage')}
function stepQty(n){$('billQty').value=Math.max(1,+$('billQty').value+n)}
function addToCart(){const qty=+$('billQty').value,batch_id=$('billBatch').value?+$('billBatch').value:null;cart.push({...selected,quantity:qty,batch_id,batch_label:$('billBatch').selectedOptions[0].text});toast('Added to cart');renderCart();go('cartPage')}
function renderCart(){let subtotal=cart.reduce((a,i)=>a+i.quantity*i.unit_price,0),discount=+$('discount').value||0,total=Math.max(0,subtotal-discount);$('cartList').innerHTML=cart.map((i,idx)=>`<div class="item"><div><b>${i.name} ${i.strength||''}</b><p>Qty ${i.quantity} • ${i.batch_label||'Auto FEFO'}</p></div><div><b>${money(i.quantity*i.unit_price)}</b><div><button onclick="cart.splice(${idx},1);renderCart()">Delete</button></div></div></div>`).join('')||'<p class="muted">No items added</p>';$('cartTotal').textContent=money(total)}
function clearCart(){cart=[];renderCart()}
async function confirmBill(){try{const body={customer_name:$('custName').value||'Walk-in Customer',customer_email:$('custEmail').value,created_by:user.user_id,discount:+$('discount').value||0,payment_method:$('payment').value,items:cart.map(i=>({medicine_id:i.medicine_id,quantity:i.quantity,batch_id:i.batch_id}))};lastBill=await api('/api/bills',{method:'POST',body:JSON.stringify(body)});cart=[];renderCart();await refreshAll();renderSuccess(lastBill);go('billSuccessPage')}catch(e){toast(e.message)}}
function renderSuccess(b){$('successBill').innerHTML=`<h3>${b.bill_no}</h3><p>Total Amount: <b>${money(b.total_amount)}</b></p><p>Date: ${b.created_at}</p><p>Payment: ${b.payment_method}</p><p>Customer: ${b.customer_name||'-'}</p>`}
async function shareLastBill(){if(!lastBill)return;let to=$('custEmail').value||lastBill.customer_email||prompt('Customer email'); if(!to)return; let smtp_username=prompt('Gmail address / SMTP username (leave blank to use env)')||null; let smtp_password=smtp_username?prompt('Gmail App Password')||null:null; try{const r=await api(`/api/bills/${lastBill.bill_id}/email`,{method:'POST',body:JSON.stringify({to_email:to,smtp_username,smtp_password})});toast(r.message)}catch(e){toast(e.message)}}
async function loadBills(){
  const el=$('billHistory');
  if(!el) return;
  el.innerHTML='<p class="muted">Loading bills...</p>';
  try{
    const rows=await api('/api/bills?ts='+Date.now());
    if(!rows || !rows.length){
      el.innerHTML='<div class="empty-state"><b>No bills yet.</b><p>Generate a bill from the billing screen and it will appear here.</p></div>';
      return;
    }
    el.innerHTML=rows.map(b=>`<div class="item bill-row" onclick="openBill(${b.bill_id})"><div><b>${b.bill_no}</b><p>${b.customer_name||'Walk-in Customer'} • ${formatDateTime(b.created_at)}<br/>${b.payment_method||'-'} • ${b.created_by_name||'User'}</p></div><b>${money(b.total_amount)}</b></div>`).join('');
  }catch(e){
    el.innerHTML=`<div class="empty-state"><b>Could not load bills.</b><p>${e.message}</p></div>`;
  }
}
function formatDateTime(v){
  if(!v) return '-';
  const d=new Date(String(v).replace(' ','T'));
  if(Number.isNaN(d.getTime())) return v;
  return d.toLocaleString([], {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
}
async function openBill(id){lastBill=await api(`/api/bills/${id}`);renderSuccess(lastBill);go('billSuccessPage')}
renderCart();
