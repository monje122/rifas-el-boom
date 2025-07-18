const supabaseUrl = "https://jnxggqxrijycuycqyzeo.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpueGdncXhyaWp5Y3V5Y3F5emVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3ODQwNzMsImV4cCI6MjA2ODM2MDA3M30.8e09092NNb2a5fBF-D4lDELlOcaObdkhxaaKyyKUNdg";
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);


// ----------- NAVEGACIÓN BÁSICA -----------
function ocultarTodo() {
  ['inicio', 'registro', 'seleccion', 'pago', 'consulta',
   'adminLogin', 'adminPanel', 'sorteador'
  ].forEach(id => document.getElementById(id).style.display = 'none');
}
function mostrarRegistro()  { ocultarTodo(); document.getElementById('registro').style.display = ''; }
function mostrarConsulta()  { ocultarTodo(); document.getElementById('consulta').style.display = ''; }
function mostrarAdmin()     { ocultarTodo(); document.getElementById('adminLogin').style.display = ''; }
function mostrarSorteador() { ocultarTodo(); document.getElementById('sorteador').style.display = ''; }
function cerrarAdmin()      { ocultarTodo(); document.getElementById('inicio').style.display = ''; }

// ----------- REGISTRO Y TICKETS -----------
let usuarioActual = null, seleccionados = [];

function validarRegistro() {
  const cedula = document.getElementById('cedula').value.trim();
  const nombre = document.getElementById('nombre').value.trim();
  const telefono = document.getElementById('telefono').value.trim();
  if (!cedula || !nombre || !telefono) {
    alert('Completa todos los campos');
    return;
  }
  usuarioActual = {cedula, nombre, telefono};
  ocultarTodo();
  document.getElementById('seleccion').style.display = '';
  cargarTickets();
}
const PRECIO_TICKET = 5;

function actualizarMonto() {
  const total = seleccionados.length * PRECIO_TICKET;
  document.getElementById('montoSeleccionado').textContent =
    `Monto total: ${total} Bs`;
}

async function cargarTickets() {
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('disponible', true)
    .order('numero', { ascending: true });

  console.log(data, error); // <-- Agrega esto para depurar

  const grid = document.getElementById('ticketGrid');
  grid.innerHTML = '';
  seleccionados = [];
   actualizarMonto();
  (data || []).forEach(ticket => {
    const div = document.createElement('div');
    div.className = 'ticket';
    div.textContent = ticket.numero;
    div.onclick = () => {
      if (seleccionados.includes(ticket.numero)) {
        seleccionados = seleccionados.filter(n => n !== ticket.numero);
        div.classList.remove('selected');
      } else {
        seleccionados.push(ticket.numero);
        div.classList.add('selected');
      }
         actualizarMonto();
    };
    grid.appendChild(div);
  });
  if (!data || data.length === 0) {
    grid.innerHTML = '<div style="color:#ff4343;">No hay tickets disponibles.</div>';
  }
}


async function confirmarTickets() {
  if (seleccionados.length < 2) {
    alert('Debes seleccionar al menos 2 tickets');
    return;
  }
  // 1. Inserta usuario si no existe
  let { data: existe } = await supabase.from('usuarios').select('id').eq('cedula', usuarioActual.cedula).maybeSingle();
  let user_id = existe?.id;
  if (!user_id) {
    let { data: insertado, error } = await supabase.from('usuarios').insert(usuarioActual).select('id').single();
    user_id = insertado.id;
  }
  usuarioActual.id = user_id;

  // 2. Reserva los tickets
  await Promise.all(seleccionados.map(num => supabase
    .from('tickets')
    .update({ disponible: false, reservado_por: user_id })
    .eq('numero', num)
  ));
  ocultarTodo();
  document.getElementById('pago').style.display = '';
   document.getElementById('montoPago').textContent =
    `Monto a pagar: ${seleccionados.length * PRECIO_TICKET} Bs`;
  document.getElementById('comprobante').value = '';
}

// ----------- COMPROBANTE -----------
async function subirComprobante() {
  const fileInput = document.getElementById('comprobante');
  const file = fileInput.files[0];
  if (!file) {
    alert('Debes subir el comprobante');
    return;
  }

  // 1. Subir archivo a storage
  const nombreArchivo = `${usuarioActual.cedula}_${Date.now()}.${file.name.split('.').pop()}`;
  const { data: fileData, error: fileError } = await supabase.storage.from('comprobantes').upload(nombreArchivo, file, { upsert: true });
  console.log("Upload:", fileData, fileError);

  if (fileError) {
    alert('Error subiendo comprobante: ' + fileError.message);
    return;
  }

  // 2. Obtener URL PÚBLICA
  const url = supabase.storage.from('comprobantes').getPublicUrl(nombreArchivo).publicUrl;
  console.log("URL comprobante que se va a guardar:", url);

  if (!url) {
    alert("No se pudo obtener la URL pública del comprobante.");
    return;
  }
  console.log("Usuario actual para comprobante:", usuarioActual);
  // 3. Crear comprobante en BD
  const { data: insertData, error: insertError } = await supabase.from('comprobantes').insert({
    usuario_id: usuarioActual.id,
    tickets: seleccionados,
    archivo_url: url,
    aprobado: false,
    rechazado: false
  });

  console.log("Insert:", insertData, insertError);
  if (insertError) {
    alert('Error insertando comprobante: ' + insertError.message);
    return;
  }

  alert('¡Comprobante enviado!');
  ocultarTodo();
  document.getElementById('inicio').style.display = '';
}


// ----------- CONSULTA DE TICKETS -----------
async function consultarTickets() {
  const ced = document.getElementById('consultaCedula').value.trim();
  const { data: usuario } = await supabase.from('usuarios').select('id,nombre').eq('cedula', ced).maybeSingle();
  const ul = document.getElementById('resultadosConsulta');
  ul.innerHTML = '';
  if (!usuario) { ul.innerHTML = "<li>No encontrado</li>"; return; }
  // Buscar tickets reservados
  const { data: tks } = await supabase.from('tickets').select('numero').eq('reservado_por', usuario.id);
  (tks || []).forEach(tk => {
    const li = document.createElement('li');
    li.textContent = tk.numero;
    ul.appendChild(li);
  });
  if (!tks.length) ul.innerHTML = "<li>Sin tickets asignados</li>";
}

// ----------- ADMIN -----------
let adminAutenticado = false;
async function loginAdmin() {
  const correo = document.getElementById('adminCorreo').value.trim();
  const clave = document.getElementById('adminClave').value.trim();
  // Solo demo: poner admin real y hash de clave en la BD
  const { data: admin } = await supabase.from('admins').select('*').eq('correo', correo).maybeSingle();
  if (!admin || admin.clave_hash !== clave) { // Solo para demo, usar hash real
    alert('Acceso denegado');
    return;
  }
  adminAutenticado = true;
  ocultarTodo();
  cargarComprobantes();
  document.getElementById('adminPanel').style.display = '';
}

async function cargarComprobantes() {
  const { data, error } = await supabase.from('comprobantes').select('*,usuarios(cedula,nombre,telefono)').order('created_at', {ascending: false});
  let totalTickets = 0, totalMonto = 0;
  const lista = document.getElementById('listaComprobantes');
  lista.innerHTML = '';
  (data || []).forEach(c => {
    totalTickets += c.tickets.length;
    // Suponiendo precio por ticket: 1$
    totalMonto += c.tickets.length * PRECIO_TICKET;
    const div = document.createElement('div');
    div.className = 'comprobante-card';
    div.innerHTML = `
      <b>${c.usuarios?.nombre || ''}</b> (${c.usuarios?.cedula || ''})<br>
      Tel: ${c.usuarios?.telefono || ''}<br>
      Tickets: ${c.tickets.join(', ')}<br>
      <a href="${c.archivo_url}" target="_blank">Ver comprobante</a><br>
      <span class="acciones">
        <span class="${c.aprobado ? 'aprobado' : (c.rechazado ? 'rechazado' : 'pendiente')}">
          ${c.aprobado ? 'Aprobado' : (c.rechazado ? 'Rechazado' : 'Pendiente')}
        </span><br>
        <button onclick="aprobarComprobante('${c.id}')">Aprobar</button>
        <button onclick="rechazarComprobante('${c.id}')">Rechazar</button>
        <button onclick="eliminarComprobante('${c.id}')">Eliminar</button>
      </span>
    `;
    lista.appendChild(div);
  });
  document.getElementById('totales').textContent =
    `Tickets vendidos: ${totalTickets} | Monto recaudado: $${totalMonto}`;
}

window.aprobarComprobante = async function(id) {
  await supabase.from('comprobantes').update({aprobado: true, rechazado: false}).eq('id', id);
  cargarComprobantes();
}
window.rechazarComprobante = async function(id) {
  // Libera tickets asociados
  const { data } = await supabase.from('comprobantes').select('tickets,usuario_id').eq('id', id).single();
  await Promise.all(data.tickets.map(num => supabase.from('tickets').update({disponible: true, reservado_por: null}).eq('numero', num)));
  await supabase.from('comprobantes').update({aprobado: false, rechazado: true}).eq('id', id);
  cargarComprobantes();
}
window.eliminarComprobante = async function(id) {
  const { data } = await supabase.from('comprobantes').select('tickets,usuario_id').eq('id', id).single();
  await Promise.all(data.tickets.map(num => supabase.from('tickets').update({disponible: true, reservado_por: null}).eq('numero', num)));
  await supabase.from('comprobantes').delete().eq('id', id);
  cargarComprobantes();
}
window.reiniciarTodo = async function() {
  if (!confirm('¿Seguro de reiniciar? Esto borra todo.')) return;
  await supabase.from('comprobantes').delete().neq('id', '');
  await supabase.from('usuarios').delete().neq('id', '');
  await supabase.from('tickets').update({disponible: true, reservado_por: null});
  cargarComprobantes();
}
window.agregarTickets = async function() {
  let desde = prompt("Número de inicio (ej: 1000 para 001000):");
  let cuantos = prompt("¿Cuántos tickets agregar?");
  desde = parseInt(desde); cuantos = parseInt(cuantos);
  if (isNaN(desde) || isNaN(cuantos)) return;
  for (let i = desde; i < desde + cuantos; i++) {
    const num = String(i).padStart(6, '0');
    await supabase.from('tickets').insert({numero: num, disponible: true});
  }
  cargarComprobantes();
}

// ----------- SORTEADOR -----------
let sorteando = false;
async function iniciarSorteo() {
  if (sorteando) return;
  sorteando = true;
  const el = document.getElementById('maquinaSorteo');
  let n = 0, ganadorFinal = null;
  // Obtener todos los comprobantes aprobados
  const { data: comprobantes } = await supabase.from('comprobantes').select('tickets,usuarios(nombre,cedula,telefono)').eq('aprobado', true);
  const ticketsAprobados = [];
  comprobantes.forEach(c => {
    c.tickets.forEach(num => ticketsAprobados.push({num, usuario: c.usuarios}));
  });
  if (!ticketsAprobados.length) {
    el.textContent = '000000';
    document.getElementById('ganador').textContent = "No hay tickets participantes";
    sorteando = false;
    return;
  }
  // Animación
  const interval = setInterval(() => {
    el.textContent = String(Math.floor(Math.random()*1000000)).padStart(6,'0');
    n++;
    if (n > 30) {
      clearInterval(interval);
      // Selecciona ganador real al azar
      const ganador = ticketsAprobados[Math.floor(Math.random()*ticketsAprobados.length)];
      el.textContent = ganador.num;
      document.getElementById('ganador').innerHTML =
        `<b>GANADOR:</b> ${ganador.num} <br>${ganador.usuario.nombre}<br>Cédula: ${ganador.usuario.cedula}<br>Tel: ${ganador.usuario.telefono}`;
      sorteando = false;
    }
  }, 90);
}

// Mostrar inicio al arrancar
ocultarTodo();
document.getElementById('inicio').style.display = '';
function irInicio() {
  ocultarTodo();
  document.getElementById('inicio').style.display = '';
}
