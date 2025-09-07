

/* ========= SUPABASE ========= */
const supabaseUrl = "https://rrudrhkuguuyxwzjuuuo.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJydWRyaGt1Z3V1eXh3emp1dXVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxMTA1MjYsImV4cCI6MjA3MjY4NjUyNn0.CQOZXAvIaBwFgwo3ip3kfJEE2DhuMo-mohwrkqZ3GX4";
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

/* ========= ESTADO GLOBAL ========= */
let PRECIO_TICKET = 5;
let cantidadElegida = 2;
let usuarioActual = null;      // { id, nombre, telefono, cedula, email }
let adminAutenticado = false;

/* ========= UTILIDADES ========= */
const $ = (id) => document.getElementById(id);
const fmtBs = (n) => `Bs. ${Number(n || 0).toLocaleString('es-VE')}`;

function esc(str){
  return String(str ?? '').replace(/[&<>"']/g, s => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[s]));
}

/* ========= NAVEGACIÓN ========= */
function ocultarTodo(){
  [
    'inicio','registro','pago','consulta',
    'adminLogin','adminPanel','sorteador'
  ].forEach(id => { const el = $(id); if (el) el.style.display = 'none'; });
}

function irInicio(){
  ocultarTodo();
  $('inicio').style.display = '';
}

function mostrarRegistro(){
  ocultarTodo();
  $('registro').style.display = '';
}

function mostrarConsulta(){
  ocultarTodo();
  $('consulta').style.display = '';
}

function mostrarAdmin(){
  ocultarTodo();
  $('adminLogin').style.display = '';
}

function mostrarSorteador(){
  ocultarTodo();
  $('sorteador').style.display = '';
}

function cerrarAdmin(){
  ocultarTodo();
  $('inicio').style.display = '';
}

/* ========= INICIO (CANTIDAD) ========= */
async function actualizarPrecioTicket(){
  const { data: confPrecio } = await supabase
    .from('config').select('valor').eq('clave','precio_ticket').maybeSingle();
  PRECIO_TICKET = confPrecio?.valor ? parseInt(confPrecio.valor,10) : 3;
  const precioUnit = $('precioUnit');
  if (precioUnit) precioUnit.textContent = fmtBs(PRECIO_TICKET);
  actualizarTotalUI();
}

function seleccionarCantidad(n){
  // mínimo 3
  cantidadElegida = Math.max(5, parseInt(n,10) || 3);
  const inp = $('cantidadInput');
  if (inp) inp.value = cantidadElegida;
  actualizarTotalUI();
}

function incrementar(){ seleccionarCantidad(cantidadElegida + 1); }
function decrementar(){ seleccionarCantidad(Math.max(3, cantidadElegida - 1)); }

function actualizarTotalUI(){
  const total = cantidadElegida * PRECIO_TICKET;
  const mt = $('montoTotal');
  if (mt) mt.textContent = fmtBs(total);
}

document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('cantidadInput');
  if (!inp) return;

  // Mientras escribe, solo actualizamos si el número es válido
  inp.addEventListener('input', () => {
    const n = parseInt(inp.value, 10);
    if (!isNaN(n)) {
      cantidadElegida = n;
      actualizarTotalUI();
    }
  });

  // Cuando deja el campo, ahí sí forzamos el mínimo 3
  inp.addEventListener('blur', () => {
    const n = parseInt(inp.value, 10) || 3;
    seleccionarCantidad(n);
  });
});


function continuarCompra(){
  mostrarRegistro();
}

/* ========= REGISTRO ========= */
function validarRegistro(){
  const nombre = $('nombre').value.trim();
  const telefono = $('telefono').value.trim();
  const cedula = $('cedula').value.trim();
  const email = $('email').value.trim();

  if (!nombre || !telefono || !cedula || !email){
    alert('Completa todos los campos');
    return;
  }

  usuarioActual = { nombre, telefono, cedula, email };

  (async () => {
    // upsert de usuario por cédula
    let { data: existe } = await supabase
      .from('usuarios').select('id').eq('cedula', cedula).maybeSingle();
    let uid = existe?.id;
    if (!uid){
      let { data: ins } = await supabase
        .from('usuarios')
        .insert({ nombre, telefono, cedula, email })
        .select('id')
        .single();
      uid = ins.id;
    }
    usuarioActual.id = uid;

    // pasar a pago
    ocultarTodo();
    $('pago').style.display = '';
    $('montoPago').textContent = 
  `Cantidad de cartones: ${cantidadElegida} — Monto a pagar: ${fmtBs(cantidadElegida * PRECIO_TICKET)}`;
  })();
}

/* ========= PAGO & COMPROBANTE ========= */
async function subirComprobante(){
  const file = $('comprobante').files[0];
  const referencia = $('referencia').value.trim();

  if (!/^\d{4}$/.test(referencia)){
    alert('Ingresa los últimos 4 números de la referencia');
    return;
  }
  if (!file){
    alert('Debes subir el comprobante de pago');
    return;
  }

  // subida al bucket (público en tu proyecto actual)
  const nombreArchivo = `${usuarioActual.cedula}_${Date.now()}.${file.name.split('.').pop()}`;
  const { data: up, error: upErr } = await supabase
    .storage.from('comprobantes')
    .upload(nombreArchivo, file, { upsert: true });

  if (upErr){
    alert('Error subiendo comprobante: ' + upErr.message);
    return;
  }

  const { data: pub } = supabase.storage.from('comprobantes').getPublicUrl(nombreArchivo);
  const url = pub.publicUrl;

  // crear comprobante: guarda CANTIDAD, no tickets
  const { error: insErr } = await supabase.from('comprobantes').insert({
    usuario_id: usuarioActual.id,
    cantidad: cantidadElegida,     // 👈 clave
    tickets: [],                   // vacío hasta la aprobación
    archivo_url: url,
    referencia,
    aprobado: false,
    rechazado: false
  });

  if (insErr){
    alert('Error guardando comprobante: ' + insErr.message);
    return;
  }

  alert('¡Comprobante enviado! Te avisaremos cuando sea aprobado.');
  irInicio();
}

/* ========= CONSULTA ========= */
async function consultarTickets(){
  const ced = $('consultaCedula').value.trim();
  const ul = $('resultadosConsulta');
  ul.innerHTML = '';

  const { data: usuario } = await supabase
    .from('usuarios').select('id,nombre').eq('cedula', ced).maybeSingle();

  if (!usuario){
    ul.innerHTML = "<li>No encontrado</li>";
    return;
  }

  const { data: comps } = await supabase
    .from('comprobantes')
    .select('tickets, aprobado, rechazado, created_at, cantidad')
    .eq('usuario_id', usuario.id)
    .order('created_at', { ascending: false });

  if (!comps?.length){
    ul.innerHTML = "<li>No tienes comprobantes aún</li>";
    return;
  }

  comps.forEach(c => {
    const li = document.createElement('li');
    if (c.aprobado && Array.isArray(c.tickets) && c.tickets.length){
      li.innerHTML = `<span style="color:#00ff66;font-weight:bold;">Aprobado:</span> Tickets: <b>${esc(c.tickets.join(', '))}</b>`;
    } else if (c.rechazado){
      li.innerHTML = `<span style="color:#ffb200;font-weight:bold;">Comprobante rechazado</span>`;
    } else {
      li.innerHTML = `Pendiente de aprobación — Cantidad: <b>${esc(c.cantidad||0)}</b>`;
    }
    ul.appendChild(li);
  });
}

/* ========= ADMIN ========= */
async function loginAdmin(){
  const correo = $('adminCorreo').value.trim();
  const clave  = $('adminClave').value.trim();

  // DEMO (igual que tenías): validar contra tabla admins
  const { data: admin } = await supabase
    .from('admins').select('*').eq('correo', correo).maybeSingle();

  if (!admin || admin.clave_hash !== clave){
    alert('Acceso denegado');
    return;
  }

  adminAutenticado = true;
  localStorage.setItem('adminCorreo', correo);
  ocultarTodo();
  $('adminPanel').style.display = '';
  await cargarComprobantes();
}

async function cargarComprobantes(){
  await actualizarPrecioTicket();

  // mostrar configuraciones actuales
  const { data: confVis } = await supabase
    .from('config').select('valor').eq('clave','tickets_visibles').maybeSingle();
  $('cantidadTicketsMostrar').value = confVis?.valor || 100;

  const { data: confPrecio } = await supabase
    .from('config').select('valor').eq('clave','precio_ticket').maybeSingle();
  $('nuevoPrecioTicket').value = confPrecio?.valor || 5;

  // listar comprobantes
  const { data, error } = await supabase
    .from('comprobantes')
    .select('*, usuarios(cedula, nombre, telefono, email)')
    .order('created_at', { ascending: false });

  const lista = $('listaComprobantes');
  lista.innerHTML = '';

  let totalTickets = 0, totalMonto = 0;

  (data || []).forEach(c => {
    // si ya está aprobado cuenta sus tickets (si no, cantidad)
    const vendidos = Array.isArray(c.tickets) && c.tickets.length ? c.tickets.length : 0;
    const cantParaMonto = vendidos || c.cantidad || 0;
    totalTickets += cantParaMonto;
    totalMonto += cantParaMonto * PRECIO_TICKET;

    const card = document.createElement('div');
    card.className = 'comprobante-card';
    const estado = c.aprobado ? 'Aprobado' : (c.rechazado ? 'Rechazado' : 'Pendiente');
    const estadoClass = c.aprobado ? 'aprobado' : (c.rechazado ? 'rechazado' : 'pendiente');
    card.innerHTML = `
      <b>${esc(c.usuarios?.nombre||'')}</b> (${esc(c.usuarios?.cedula||'')})<br>
      Tel: ${esc(c.usuarios?.telefono||'')} — ${esc(c.usuarios?.email||'')}<br>
      ${c.aprobado ? `Tickets: ${esc((c.tickets||[]).join(', '))}` : `Cantidad solicitada: ${esc(c.cantidad||0)}`}<br>
      Referencia: <b>${esc(c.referencia||'—')}</b><br>
      <a href="${esc(c.archivo_url||'#')}" target="_blank" rel="noopener">Ver comprobante</a><br>
      <span class="acciones">
        <span class="${estadoClass}">${estado}</span><br>
        ${!c.aprobado ? `<button onclick="aprobarComprobante('${c.id}')">Aprobar</button>` : ''}
        ${!c.aprobado ? `<button onclick="rechazarComprobante('${c.id}')">Rechazar</button>` : ''}
        <button onclick="eliminarComprobante('${c.id}')">Eliminar</button>
      </span>
    `;
    lista.appendChild(card);
  });

  $('totales').textContent =
    `Tickets (solicitados + aprobados): ${totalTickets} | Monto estimado: ${fmtBs(totalMonto)}`;
}

/* aprobar: asigna tickets aleatorios y aprueba en una transacción (RPC) */
window.aprobarComprobante = async function(id){
  try{
    const { data, error } = await supabase.rpc('approve_and_assign_random', { _comp_id: id });
    if (error) throw error;
    const lista = Array.isArray(data) ? data.join(', ') : '—';
    alert(`Aprobado ✅\nTickets asignados: ${lista}`);
  }catch(e){
    console.error(e);
    alert('Error al aprobar/asignar: ' + (e.message || e));
  }finally{
    await cargarComprobantes();
  }
};

/* rechazar: (antes de aprobar) sólo marca rechazado */
window.rechazarComprobante = async function(id){
  try{
    await supabase.from('comprobantes')
      .update({ aprobado:false, rechazado:true })
      .eq('id', id);
    alert('Comprobante rechazado');
  }catch(e){
    alert('Error al rechazar: ' + (e.message||e));
  }finally{
    await cargarComprobantes();
  }
};

/* eliminar: borra comprobante; como los tickets sólo se asignan al aprobar, aquí no hay que liberar */
window.eliminarComprobante = async function(id){
  if (!confirm('¿Eliminar este comprobante? Si estaba aprobado, liberarás sus tickets.')) return;

  try {
    // 1) Traer el comprobante (para conocer sus tickets y el archivo)
    const { data: comp, error: e1 } = await supabase
      .from('comprobantes')
      .select('id, aprobado, tickets, archivo_url')
      .eq('id', id)
      .maybeSingle();
    if (e1) throw e1;

    // 2) Si estaba aprobado y tiene tickets, liberarlos
    if (comp?.aprobado && Array.isArray(comp.tickets) && comp.tickets.length){
      const numeros = comp.tickets.filter(n => n != null);
      const { error: e2 } = await supabase
        .from('tickets')
        .update({
          disponible: true,
          vendido: false,
          reservado_por: null,
          reservado_en: null,
          // comprobante_id: null,  // si usas esta columna
        })
        .in('numero', numeros);
      if (e2) throw e2;
    }

    // 3) (Opcional) borrar el archivo del bucket 'comprobantes'
    if (comp?.archivo_url){
      const partes = comp.archivo_url.split('/');
      const nombre = partes[partes.length - 1];
      await supabase.storage.from('comprobantes').remove([nombre]);
    }

    // 4) Borrar el comprobante
    const { error: e3 } = await supabase.from('comprobantes').delete().eq('id', id);
    if (e3) throw e3;

    alert('✅ Comprobante eliminado. Tickets liberados (si aplicaba).');
  } catch (e) {
    alert('❌ Error al eliminar: ' + (e.message || e));
  } finally {
    await cargarComprobantes();
  }
};

/* guardar config admin */
async function guardarPrecioTicket(){
  const precio = parseInt($('nuevoPrecioTicket').value, 10) || 5;
  await supabase.from('config').upsert([{ clave:'precio_ticket', valor:precio }]);
  alert('¡Precio actualizado!');
  await cargarComprobantes();
}
window.guardarPrecioTicket = guardarPrecioTicket;

async function guardarCantidadTickets(){
  const cant = parseInt($('cantidadTicketsMostrar').value, 10) || 100;
  await supabase.from('config').upsert([{ clave:'tickets_visibles', valor:cant }]);
  alert('Cantidad actualizada');
}
window.guardarCantidadTickets = guardarCantidadTickets;

/* ========= FOTO DE INICIO ========= */
async function mostrarFotoInicio(){
  const { data: conf } = await supabase
    .from('config').select('valor').eq('clave','foto-inicio').maybeSingle();
  const fotoInicio = $('fotoInicio');
  if (!fotoInicio) return;
  if (conf?.valor){
    fotoInicio.src = conf.valor;
    fotoInicio.style.display = '';
  }else{
    fotoInicio.src = "";
    fotoInicio.style.display = 'none';
  }
}

/* ========= SORTEADOR (SIN CAMBIOS GRANDES) ========= */
let sorteando = false;
async function iniciarSorteo(){
  if (sorteando) return;
  sorteando = true;
  const el = $('maquinaSorteo');
  let n = 0;

  const { data: comprobantes } = await supabase
    .from('comprobantes')
    .select('tickets, usuarios(nombre,cedula,telefono)')
    .eq('aprobado', true);

  const ticketsAprobados = [];
  (comprobantes||[]).forEach(c=>{
    (c.tickets||[]).forEach(num=>{
      ticketsAprobados.push({ num, usuario: c.usuarios });
    });
  });

  if (!ticketsAprobados.length){
    el.textContent = '000000';
    $('ganador').textContent = "No hay tickets participantes";
    sorteando = false;
    return;
  }

  const interval = setInterval(()=>{
    el.textContent = String(Math.floor(Math.random()*1000000)).padStart(6,'0');
    n++;
    if (n > 30){
      clearInterval(interval);
      const ganador = ticketsAprobados[Math.floor(Math.random()*ticketsAprobados.length)];
      el.textContent = String(ganador.num).padStart(6,'0');
      $('ganador').innerHTML = `<b>GANADOR:</b> ${esc(ganador.num)}<br>${esc(ganador.usuario?.nombre||'')}
      <br>Cédula: ${esc(ganador.usuario?.cedula||'')}<br>Tel: ${esc(ganador.usuario?.telefono||'')}`;
      sorteando = false;
    }
  }, 90);
}
window.iniciarSorteo = iniciarSorteo;

/* ========= INICIO AL CARGAR ========= */
window.onload = async function(){
  ocultarTodo();
  $('inicio').style.display = '';
  await actualizarPrecioTicket();
  await mostrarFotoInicio();
  seleccionarCantidad(2);

  // Accesos “ocultos” opcionales: ALT+A para mostrar botón admin durante 10s
  document.addEventListener('keydown', function(e){
    if (e.altKey && e.key.toLowerCase() === 'a'){
      const adminBtn = $('btnAdmin');
      if (adminBtn){
        adminBtn.style.display = '';
        adminBtn.focus();
        setTimeout(()=>{ adminBtn.style.display = 'none'; }, 10000);
      }
    }
  });
};

/* ========= EXPOSED PARA HTML ========= */
window.mostrarRegistro = mostrarRegistro;
window.mostrarConsulta = mostrarConsulta;
window.mostrarAdmin    = mostrarAdmin;
window.cerrarAdmin     = cerrarAdmin;

window.seleccionarCantidad = seleccionarCantidad;
window.incrementar = incrementar;
window.decrementar = decrementar;
window.continuarCompra = continuarCompra;

window.validarRegistro = validarRegistro;
window.subirComprobante = subirComprobante;
window.consultarTickets = consultarTickets;

window.loginAdmin = loginAdmin;
// Muestra la foto del premio en portada + preview en Admin
async function mostrarFotoInicio() {
  try {
    const { data: conf, error } = await supabase
      .from('config')
      .select('valor')
      .eq('clave', 'foto-inicio')
      .maybeSingle();

    const imgHome   = document.getElementById('fotoInicio');
    const imgPrev   = document.getElementById('previewFotoInicio');
    const estadoEl  = document.getElementById('fotoInicioEstado');

    const url = conf?.valor || '';

    if (imgHome) {
      if (url) { imgHome.src = url; imgHome.style.display = ''; }
      else { imgHome.src = ''; imgHome.style.display = 'none'; }
    }

    if (imgPrev) {
      if (url) { imgPrev.src = url; imgPrev.style.display = ''; }
      else { imgPrev.src = ''; imgPrev.style.display = 'none'; }
    }

    if (estadoEl) estadoEl.textContent = url ? 'Actualizada' : 'No configurada';
  } catch (e) {
    console.error('mostrarFotoInicio()', e);
  }
}

// Subir foto al bucket 'imagenes-inicio' y guardar URL en config.foto-inicio
async function subirFotoInicio() {
  const input = document.getElementById('fotoInicioInput');
  const file  = input?.files?.[0];
  if (!file) { alert('Selecciona una imagen'); return; }

  const nombre = `inicio_${Date.now()}.${file.name.split('.').pop()}`;

  // 1) Subir a Storage
  const { error: upErr } = await supabase
    .storage.from('imagenes-inicio')
    .upload(nombre, file, { upsert: true });

  if (upErr) { alert('Error subiendo: ' + upErr.message); return; }

  // 2) Obtener URL pública
  const { data: urlData } = supabase
    .storage.from('imagenes-inicio')
    .getPublicUrl(nombre);

  const url = urlData?.publicUrl;
  if (!url) { alert('No se pudo obtener URL pública'); return; }

  // 3) Guardar en config
  await supabase.from('config')
    .upsert([{ clave: 'foto-inicio', valor: url }]);

  // 4) UI
  document.getElementById('fotoInicioInput').value = '';
  await mostrarFotoInicio();
  alert('Foto actualizada');
}

// Borrar foto de inicio (archivo en Storage + valor en config)
async function borrarFotoInicio() {
  if (!confirm('¿Borrar la foto de inicio?')) return;

  const { data: conf } = await supabase
    .from('config')
    .select('valor')
    .eq('clave', 'foto-inicio')
    .maybeSingle();

  const url = conf?.valor || '';
  if (url) {
    // nombre de archivo desde la URL
    const partes = url.split('/');
    const nombre = partes[partes.length - 1];

    await supabase.storage.from('imagenes-inicio').remove([nombre]);
  }

  await supabase.from('config')
    .update({ valor: null })
    .eq('clave', 'foto-inicio');

  await mostrarFotoInicio();
  alert('Foto borrada');
}

// Llama al cargar la app (ya lo puedes tener, pero asegúrate de invocarla)
window.addEventListener('load', mostrarFotoInicio);
function toggleTheme() {
  const body = document.body;
  const btn  = document.getElementById('btnToggleTheme');

  if (body.classList.contains('dark')) {
    body.classList.remove('dark');
    body.classList.add('invert');               // ← en vez de “claro”, usamos invertido
    localStorage.setItem('theme', 'invert');
    if (btn) btn.textContent = '🌙 Modo Oscuro';
  } else if (body.classList.contains('invert')) {
    body.classList.remove('invert');
    body.classList.add('dark');
    localStorage.setItem('theme', 'dark');
    if (btn) btn.textContent = '☀️ Modo Claro (invertido)';
  } else {
    // estado inicial: forzamos dark
    body.classList.add('dark');
    localStorage.setItem('theme', 'dark');
    if (btn) btn.textContent = '☀️ Modo Claro (invertido)';
  }
}

// Aplicar al cargar (sin “togglear”)
window.addEventListener('load', () => {
  const theme = localStorage.getItem('theme') || 'dark';
  document.body.classList.toggle('dark',   theme === 'dark');
  document.body.classList.toggle('invert', theme === 'invert');

  const btn = document.getElementById('btnToggleTheme');
  if (btn) btn.textContent = theme === 'dark' ? '☀️ Modo Claro (invertido)' : '🌙 Modo Oscuro';
});

async function mostrarTitulo() {
  const { data: conf } = await supabase
    .from('config')
    .select('valor')
    .eq('clave', 'titulo_rifa')
    .maybeSingle();

  const tituloEl = document.getElementById('tituloRifa');
  if (tituloEl) {
    tituloEl.textContent = conf?.valor || 'COMBO SOLUCIÓN #6';
  }

  const inputAdmin = document.getElementById('nuevoTitulo');
  if (inputAdmin) {
    inputAdmin.value = conf?.valor || '';
  }
}
window.addEventListener('load', mostrarTitulo);
async function guardarTitulo() {
  const nuevo = document.getElementById('nuevoTitulo').value.trim();
  await supabase.from('config')
    .upsert([{ clave: 'titulo_rifa', valor: nuevo }]);
  alert('Título actualizado');
  await mostrarTitulo();
}
window.guardarTitulo = guardarTitulo;

// Lista y borra TODO el contenido del bucket (raíz). Agrega prefix si usas subcarpetas.
async function borrarTodoBucket(bucket) {
  let page = 0, all = [];
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list('', { limit: 100, offset: page * 100 });
    if (error) throw new Error('Storage list: ' + error.message);
    if (!data || data.length === 0) break;
    all = all.concat(data.map(f => f.name));
    if (data.length < 100) break;
    page++;
  }
  for (let i = 0; i < all.length; i += 100) {
    const slice = all.slice(i, i + 100);
    const { error } = await supabase.storage.from(bucket).remove(slice);
    if (error) throw new Error('Storage remove: ' + error.message);
  }
}

async function reiniciarRifa() {
  if (!confirm("⚠️ Borrará archivos de comprobantes, liberará tickets y vaciará la tabla de comprobantes. ¿Seguro?")) return;

  try {
    // 1) BORRAR ARCHIVOS DEL BUCKET (robusto, sin depender de URLs)
    await borrarTodoBucket('comprobantes');

    // 2) LIBERAR TODOS LOS TICKETS (tu esquema real)
    const { error: updErr } = await supabase
      .from('tickets')
      .update({
        reservado_por: null,
        reservado_en: null,
        vendido: false,   // si usas esta columna
        disponible: true
      })
      .not('numero', 'is', null); // o .not('id','is', null) si tienes id
    if (updErr) throw new Error('Tickets: ' + updErr.message);

    // 3) BORRAR TODOS LOS COMPROBANTES
    const { error: delErr } = await supabase
      .from('comprobantes')
      .delete()
      .not('id', 'is', null);
    if (delErr) throw new Error('Comprobantes: ' + delErr.message);
    
    // 3.5) (Opcional) Borrar TODOS los usuarios de la tabla pública
const { error: delUsersErr } = await supabase
  .from('usuarios')
  .delete()
  .not('id','is', null);

if (delUsersErr) { alert("❌ No se borraron usuarios: " + delUsersErr.message); return; }


    alert("✅ Rifa reiniciada. Archivos borrados, tickets liberados y comprobantes eliminados.");
    await cargarComprobantes();
  } catch (e) {
    alert('❌ ' + e.message);
  }
}
window.reiniciarRifa = reiniciarRifa;

// === Entradas móviles al Admin ===
// === 5 toques en el LOGO para abrir Admin ===
window.addEventListener('load', () => {
  const logo = document.getElementById('logoRifa');
  if (!logo) return;

  const WINDOW_MS = 2500;   // ventana de tiempo para contar 5 toques
  let taps = 0;
  let firstTs = 0;

  const countTap = () => {
    const now = Date.now();
    if (!firstTs || (now - firstTs) > WINDOW_MS) {
      // reinicia la ventana si pasó el tiempo
      firstTs = now;
      taps = 0;
    }
    taps++;
    if (taps >= 5) {
      taps = 0;
      firstTs = 0;
      try { mostrarAdmin(); } catch {}
    }
  };

  // Móvil (toque)
  logo.addEventListener('touchend', () => countTap(), { passive: true });

  // Desktop (click) – opcional, por si lo pruebas en PC
  logo.addEventListener('click', () => countTap());
});
// Prefill del correo desde el login guardado
function toggleCambioClave(){
  const box = document.getElementById('cambioClaveBox');
  const btn = document.getElementById('btnMostrarCambioClave');
  if (!box) return;

  box.classList.toggle('hidden');
  if (btn) btn.textContent = box.classList.contains('hidden') ? '🔐 Cambiar contraseña' : '🔐 Ocultar cambio de contraseña';

  // Prefill del correo con el que inició sesión
  const c = localStorage.getItem('adminCorreo');
  const inp = document.getElementById('adminCorreoCambio');
  if (c && inp) inp.value = c;

  if (!box.classList.contains('hidden')) {
    // foco al primer campo
    setTimeout(()=> document.getElementById('adminPassActual2')?.focus(), 50);
  }
}

window.adminCambiarClaveTabla = async function () {
  const correo = (document.getElementById('adminCorreoCambio').value || '').trim();
  const actual = document.getElementById('adminPassActual2').value;
  const nueva  = document.getElementById('adminPassNueva2').value;
  const rep    = document.getElementById('adminPassRepite2').value;

  if (!correo || !actual || !nueva || !rep) { alert('Completa todos los campos'); return; }
  if (nueva.length < 8) { alert('La nueva contraseña debe tener al menos 8 caracteres'); return; }
  if (nueva !== rep) { alert('La nueva contraseña no coincide'); return; }

  // Buscar admin
  const { data: admin, error } = await supabase
    .from('admins').select('id, clave_hash').eq('correo', correo).maybeSingle();

  if (error || !admin) { alert('Admin no encontrado'); return; }
  if (admin.clave_hash !== actual) { alert('Contraseña actual incorrecta'); return; }

  // Actualizar contraseña (igual que tu login: texto plano en clave_hash)
  const { error: updErr } = await supabase
    .from('admins')
    .update({ clave_hash: nueva })
    .eq('id', admin.id);

  if (updErr) { alert('No se pudo cambiar la contraseña: ' + updErr.message); return; }

  alert('✅ Contraseña actualizada');
  document.getElementById('adminPassActual2').value = '';
  document.getElementById('adminPassNueva2').value  = '';
  document.getElementById('adminPassRepite2').value = '';
  toggleCambioClave(); // ocultar al terminar
};
