
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
  cantidadElegida = Math.max(3, parseInt(n,10) || 3);
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
/* ========= REGISTRO ========= */
async function validarRegistro(){
  const nombre   = $('nombre').value.trim();
  const telefono = $('telefono').value.trim();
  const cedula   = $('cedula').value.trim();
  const email    = $('email').value.trim();

  if (!nombre || !telefono || !cedula || !email){
    alert('Completa todos los campos');
    return;
  }

  usuarioActual = { nombre, telefono, cedula, email };

  try {
    // 1) Upsert de usuario por cédula
    let { data: existe, error: errSel } = await supabase
      .from('usuarios').select('id').eq('cedula', cedula).maybeSingle();
    if (errSel) throw errSel;

    let uid = existe?.id;
    if (!uid){
      const { data: ins, error: errIns } = await supabase
        .from('usuarios')
        .insert({ nombre, telefono, cedula, email })
        .select('id')
        .single();
      if (errIns) throw errIns;
      uid = ins.id;
    }
    usuarioActual.id = uid;

    // 2) Crear PENDIENTE + RESERVA por 5 minutos (sin bloquear si ya tiene otro)
    const { data: compId, error: errHold } = await supabase.rpc('create_pending_and_hold', {
      _usuario_id: uid,
      _cantidad: cantidadElegida,
      _timeout_min: 5
    });
    if (errHold) {
      alert(errHold.message || 'No se pudo reservar la cantidad seleccionada. Intenta con menos.');
      return;
    }

    // Guardar id de este comprobante pendiente (para subirComprobante)
    usuarioActual.comprobantePendienteId = compId;

    // 3) Ir a Pago
    ocultarTodo();
    $('pago').style.display = '';
    $('montoPago').textContent =
      `Cantidad de cartones: ${cantidadElegida} — Monto a pagar: ${fmtBs(cantidadElegida * PRECIO_TICKET)}`;

  } catch (e){
    console.error(e);
    alert(e.message || 'Ocurrió un error. Intenta de nuevo.');
  }
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

  try{
    // 1) Subir archivo a Storage
    const nombreArchivo = `${usuarioActual.cedula}_${Date.now()}.${file.name.split('.').pop()}`;
    const { error: upErr } = await supabase
      .storage.from('comprobantes')
      .upload(nombreArchivo, file, { upsert: true });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from('comprobantes').getPublicUrl(nombreArchivo);
    const url = pub.publicUrl;

    // 2) Actualizar el comprobante pendiente
    const compId = usuarioActual?.comprobantePendienteId;
    if (!compId){ alert('No hay comprobante pendiente asociado.'); return; }

    const { error: updErr } = await supabase
      .from('comprobantes')
      .update({ referencia, archivo_url: url })
      .eq('id', compId);
    if (updErr) throw updErr;

    // 3) ❄️ CONGELAR la reserva: que NO caduque
    const { error: fixErr } = await supabase.rpc('confirm_hold_after_receipt', {
      _comp_id: compId
    });
    if (fixErr) throw fixErr;

    alert('¡Comprobante enviado! Tu reserva quedó asegurada hasta que el admin apruebe.');
    irInicio();

  } catch (e){
    console.error(e);
    alert('No se pudo procesar el comprobante: ' + (e.message || e));
  }
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
      li.innerHTML = `<span style="color:#00ff66;font-weight:bold;">Aprobado:</span> Tickets: <b>${esc(c.tickets.map(fmtTicket).join(', '))}</b>`;
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
   await supabase.rpc('liberar_reservas_viejas', { _minutos: 5 });

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
      ${c.aprobado ? `Tickets: ${esc((c.tickets||[]).map(fmtTicket).join(', '))}` : `Cantidad solicitada: ${esc(c.cantidad||0)}`}<br>
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
    const { data, error } = await supabase.rpc('approve_using_holds', {
      _comp_id: id,
      _timeout_min: 5
    });
    if (error) throw error;
    alert(`Aprobado ✅\nTickets asignados: ${(data||[]).join(', ')}`);
  }catch(e){
    alert('Error al aprobar/asignar: ' + (e.message || e));
  }finally{
    await cargarComprobantes();
  }
};

/* rechazar: (antes de aprobar) sólo marca rechazado */
window.rechazarComprobante = async function(id){
  if (!confirm('¿Rechazar y liberar los tickets de este comprobante?')) return;
  try{
    // libera todo y borra el comprobante
    const { error } = await supabase.rpc('cancelar_y_liberar_comprobante', { _comp_id: id });
    if (error) throw error;
    alert('✅ Rechazado y liberado.');
  }catch(e){
    alert('❌ Error al rechazar: ' + (e.message || e));
  }finally{
    await cargarComprobantes();
  }
};


/* eliminar: borra comprobante; como los tickets sólo se asignan al aprobar, aquí no hay que liberar */
window.eliminarComprobante = async function(id){
  if (!confirm('¿Eliminar este comprobante? Liberará sus tickets (aprobados o reservados).')) return;

  try{
    const { error } = await supabase.rpc('cancelar_y_liberar_comprobante', { _comp_id: id });
    if (error) throw error;
    alert('✅ Comprobante eliminado y tickets liberados.');
  }catch(e){
    alert('❌ Error al eliminar: ' + (e.message || e));
  }finally{
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


/* ========= INICIO AL CARGAR ========= */
window.onload = async function(){
  ocultarTodo();
  $('inicio').style.display = '';
   await supabase.rpc('liberar_reservas_viejas', { _minutos: 5 });
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
    if (btn) btn.textContent = '🌙';
  } else if (body.classList.contains('invert')) {
    body.classList.remove('invert');
    body.classList.add('dark');
    localStorage.setItem('theme', 'dark');
    if (btn) btn.textContent = '☀️ ';
  } else {
    // estado inicial: forzamos dark
    body.classList.add('dark');
    localStorage.setItem('theme', 'dark');
    if (btn) btn.textContent = '☀️ ';
  }
}

// Aplicar al cargar (sin “togglear”)
window.addEventListener('load', () => {
  const theme = localStorage.getItem('theme') || 'dark';
  document.body.classList.toggle('dark',   theme === 'dark');
  document.body.classList.toggle('invert', theme === 'invert');

  const btn = document.getElementById('btnToggleTheme');
  if (btn) btn.textContent = theme === 'dark' ? '☀️ ' : '🌙 ';
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

// Helper: leer un valor desde config
async function getConfigValor(clave) {
  const { data, error } = await supabase
    .from('config')
    .select('valor')
    .eq('clave', clave)
    .maybeSingle();
  if (error) throw new Error('Config: ' + error.message);
  return data?.valor ?? null;
}

async function reiniciarRifa() {
  // 0) Obtener la clave de reinicio desde Supabase
  let claveCorrecta;
  try {
    claveCorrecta = await getConfigValor('clave_reinicio'); // ← guarda esta clave en la tabla config
  } catch (e) {
    alert('❌ No se pudo leer clave de reinicio: ' + (e.message || e));
    return;
  }
  if (!claveCorrecta) {
    alert('❌ No existe "clave_reinicio" en config. Crea una en la tabla config.');
    return;
  }

  // 1) Pedir la clave al admin
  const claveIngresada = prompt('⚠️ Para reiniciar escribe la clave secreta:');
  if (claveIngresada !== claveCorrecta) {
    alert('❌ Clave incorrecta. Operación cancelada.');
    return;
  }

  // 2) Confirmación final
  if (!confirm('⚠️ Borrará archivos de comprobantes, liberará tickets y vaciará la tabla de comprobantes. ¿Seguro?')) return;

  try {
    // 3) BORRAR ARCHIVOS DEL BUCKET (robusto)
    await borrarTodoBucket('comprobantes');

    // 4) LIBERAR TODOS LOS TICKETS
    const { error: updErr } = await supabase
      .from('tickets')
      .update({
        reservado_por: null,
        reservado_en: null,
        vendido: false,
        disponible: true
      })
      .not('numero', 'is', null);
    if (updErr) throw new Error('Tickets: ' + updErr.message);

    // 5) BORRAR TODOS LOS COMPROBANTES
    const { error: delErr } = await supabase
      .from('comprobantes')
      .delete()
      .not('id', 'is', null);
    if (delErr) throw new Error('Comprobantes: ' + delErr.message);

    // 6) (Opcional) BORRAR TODOS LOS USUARIOS
    // Si NO quieres borrar usuarios, comenta este bloque:
    const { error: delUsersErr } = await supabase
      .from('usuarios')
      .delete()
      .not('id','is', null);
    if (delUsersErr) throw new Error('Usuarios: ' + delUsersErr.message);

    alert('✅ Rifa reiniciada. Archivos borrados, tickets liberados y comprobantes eliminados.');
    await cargarComprobantes();
  } catch (e) {
    alert('❌ ' + (e.message || e));
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
async function limpiarComprobantesAprobadosSi(umbral = 50) {
  const { data: aprobados } = await supabase
    .from('comprobantes')
    .select('id, archivo_url')
    .eq('aprobado', true);

  if (!aprobados || aprobados.length < umbral) return;

  const nombres = aprobados
    .map(c => { try { return new URL(c.archivo_url).pathname.split('/').pop(); } catch { return null; } })
    .filter(Boolean);

  if (nombres.length) {
    await supabase.storage.from('comprobantes').remove(nombres);
    await supabase.from('comprobantes')
      .update({ archivo_url: null })
      .in('id', aprobados.map(c => c.id));
  }
}
function fmtTicket(n) {
  return String(n).padStart(4, "0");
}
async function buscarTicket(){
  const out = $('resultadoTicket');
  out.textContent = '';
  const raw = ($('ticketBuscar').value || '').trim();

  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 0){
    out.innerHTML = `<span style="color:#ffb200">Ingresa un número de ticket válido.</span>`;
    return;
  }

  try{
    // Busca comprobantes APROBADOS que contengan ese número en su array 'tickets'
    const { data: comp, error } = await supabase
      .from('comprobantes')
      .select(`
        id,
        aprobado,
        tickets,
        usuarios:usuarios (
          nombre,
          cedula,
          email,
          telefono
        )
      `)
      .eq('aprobado', true)
      .contains('tickets', [n])
      .maybeSingle();

    if (error) throw error;

    if (!comp){
      out.innerHTML = `<span style="color:#ff4343">No se encontró un ticket aprobado con ese número.</span>`;
      return;
    }

    const u = comp.usuarios || {};
    out.innerHTML = `
      <div style="background:#1b2330;border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:12px;">
        <div><b>Ticket:</b> ${esc(fmtTicket(n))}</div>
        <div><b>Nombre:</b> ${esc(u.nombre || '—')}</div>
        <div><b>Cédula:</b> ${esc(u.cedula || '—')}</div>
        <div><b>Correo:</b> ${esc(u.email || '—')}</div>
        <div><b>Teléfono:</b> ${esc(u.telefono || '—')}</div>
      </div>
    `;
  }catch(e){
    console.error(e);
    out.innerHTML = `<span style="color:#ff4343">Error consultando el ticket. Intenta de nuevo.</span>`;
  }
}
window.buscarTicket = buscarTicket;
