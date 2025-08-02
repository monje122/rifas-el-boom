const supabaseUrl = "https://jnxggqxrijycuycqyzeo.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpueGdncXhyaWp5Y3V5Y3F5emVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3ODQwNzMsImV4cCI6MjA2ODM2MDA3M30.8e09092NNb2a5fBF-D4lDELlOcaObdkhxaaKyyKUNdg";
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

let intervaloContadorTickets = null;

// ----------- NAVEGACIÓN BÁSICA -----------
function ocultarTodo() {
  ['inicio', 'registro', 'seleccion', 'pago', 'consulta',
   'adminLogin', 'adminPanel', 'sorteador'
  ].forEach(id => document.getElementById(id).style.display = 'none');
 if (intervaloContadorTickets) {
    clearInterval(intervaloContadorTickets);

  intervaloContadorTickets = null;
  }  // <-- Aquí CIERRAS el if


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
  
    // Inicia el contador en vivo
  if (intervaloContadorTickets) clearInterval(intervaloContadorTickets);
  intervaloContadorTickets = setInterval(actualizarContadorTickets, 5000)
}
let PRECIO_TICKET = 5;

// Función para actualizar el precio desde config
async function actualizarPrecioTicket() {
  const { data: confPrecio } = await supabase.from('config')
    .select('valor')
    .eq('clave', 'precio_ticket')
    .maybeSingle();
  PRECIO_TICKET = confPrecio?.valor ? parseInt(confPrecio.valor, 10) : 5;
}


function actualizarMonto() {
  const total = seleccionados.length * PRECIO_TICKET;
  document.getElementById('montoSeleccionado').textContent =
    `Monto total: ${total} Bs`;
}

async function cargarTickets(){
   await actualizarPrecioTicket();
  await liberarTicketsVencidos();
 const { data: conf } = await supabase
    .from('config')
    .select('valor')
    .eq('clave', 'tickets_visibles')
    .maybeSingle();

  console.log("Tipo de conf.valor:", typeof conf?.valor, conf?.valor);

  const maxTickets = parseInt(conf?.valor) > 0 ? parseInt(conf.valor) : 100;
  console.log("maxTickets a usar:", maxTickets);
 // *** 1. Contar tickets disponibles ***
   // Total de tickets (no importa si están reservados o no)
   const { count: totalTickets } = await supabase
     .from('tickets')
     .select('*', { count: 'exact', head: true });

   // Tickets disponibles actualmente
   const { count: disponibles } = await supabase
     .from('tickets')
     .select('*', { count: 'exact', head: true })
     .eq('disponible', true);

   // Muestra el contador en la interfaz
   document.getElementById('ticketContador').textContent = `${disponibles} de ${totalTickets} disponibles`;
  
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('disponible', true)
    .order('numero', { ascending: true })
   .limit(maxTickets);

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
async function liberarTicketsVencidos() {
  const hace7min = new Date(Date.now() - 3 * 60 * 1000).toISOString();

  // 1. Buscar tickets vencidos (reservados hace más de 7 minutos)
  const { data: ticketsVencidos, error: errorTickets } = await supabase
    .from('tickets')
    .select('numero, reservado_por, reservado_en')
    .eq('disponible', false)
    .lt('reservado_en', hace7min);

  if (errorTickets) {
    console.error("Error buscando tickets vencidos:", errorTickets);
    return;
  }

  if (!ticketsVencidos || ticketsVencidos.length === 0) return;

  // 2. Verifica si hay comprobantes válidos (aprobados o pendientes) por ticket
  for (let ticket of ticketsVencidos) {
    const { data: comprobante, error: errorComp } = await supabase
      .from('comprobantes')
      .select('id, aprobado, rechazado, tickets')
      .eq('usuario_id', ticket.reservado_por)
      .contains('tickets', [ticket.numero])
      .maybeSingle();

    if (errorComp) {
      console.error("Error verificando comprobante para ticket", ticket.numero, errorComp);
      continue;
    }

    // ⚠️ SOLO liberar si NO hay comprobante, o si está rechazado explícitamente
    if (!comprobante || comprobante.rechazado === true) {
      await supabase
        .from('tickets')
        .update({ disponible: true, reservado_por: null, reservado_en: null })
        .eq('numero', ticket.numero);

      console.log(`🎫 Ticket ${ticket.numero} liberado automáticamente.`);
    } else {
      console.log(`⛔ Ticket ${ticket.numero} NO se libera (comprobante válido detectado).`);
    }
  }
}
async function confirmarTickets() {
  if (seleccionados.length < 2) {
    alert('Debes seleccionar al menos 2 tickets');
    return;
  }
  // 1. Asegúrate de tener el usuario en la BD
  let { data: existe } = await supabase.from('usuarios').select('id').eq('cedula', usuarioActual.cedula).maybeSingle();
  let user_id = existe?.id;
  if (!user_id) {
    let { data: insertado } = await supabase.from('usuarios').insert(usuarioActual).select('id').single();
    user_id = insertado.id;
  }
  usuarioActual.id = user_id;

  // 2. Intenta reservar cada ticket SOLO si sigue disponible y guarda la hora
  let exitosos = [];
  const now = new Date().toISOString();
  for (let num of seleccionados) {
    const { data, error } = await supabase
      .from('tickets')
      .update({ 
        disponible: false, 
        reservado_por: user_id, 
        reservado_en: now            // <-- ¡Aquí guardas la hora de reserva!
      })
      .eq('numero', num)
      .eq('disponible', true)
      .select()
      .single();

    if (data) exitosos.push(num);
  }

  // 3. Si no pudo reservar todos, libera los reservados y pide reintentar
  if (exitosos.length !== seleccionados.length) {
    // Libera los tickets que sí logró reservar en este intento
    for (let num of exitosos) {
      await supabase
        .from('tickets')
        .update({ disponible: true, reservado_por: null, reservado_en: null })
        .eq('numero', num);
    }
    alert(
      `⚠️ ¡Algunos tickets ya no estaban disponibles!\n\nSolo se apartaron estos: ${exitosos.join(', ')}.\nSelecciona otros y vuelve a intentar.`
    );
    // Recarga la grilla de tickets
    await cargarTickets();
    return;
  }

  // 4. Si todo salió bien, sigue al pago
  ocultarTodo();
  document.getElementById('pago').style.display = '';
  document.getElementById('montoPago').textContent =
    `Monto a pagar: ${seleccionados.length * PRECIO_TICKET} Bs`;
  document.getElementById('comprobante').value = '';

  // (Opcional) Inicia el temporizador visual de 7 minutos en la pantalla de pago
  if (typeof iniciarTimerReserva === "function") iniciarTimerReserva();
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
  const { data, error } = supabase.storage.from('comprobantes').getPublicUrl(nombreArchivo);
const url = data.publicUrl;

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
  const ul = document.getElementById('resultadosConsulta');
  ul.innerHTML = '';

  // 1. Busca usuario por cédula
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id,nombre')
    .eq('cedula', ced)
    .maybeSingle();

  if (!usuario) {
    ul.innerHTML = "<li>No encontrado</li>";
    return;
  }

  // 2. Busca comprobantes de ese usuario
  const { data: comprobantes } = await supabase
    .from('comprobantes')
    .select('tickets, aprobado, rechazado, created_at')
    .eq('usuario_id', usuario.id)
    .order('created_at', { ascending: false });

  if (!comprobantes || comprobantes.length === 0) {
    ul.innerHTML = "<li>No tienes comprobantes aún</li>";
    return;
  }

  // 3. Mostrar por comprobante
  comprobantes.forEach((comp, idx) => {
    const li = document.createElement('li');
    if (comp.aprobado) {
      li.innerHTML = `<span style="color:#00ff66;font-weight:bold;">Aprobado:</span> Tickets: <b>${comp.tickets.join(', ')}</b>`;
    } else if (comp.rechazado) {
      li.innerHTML = `<span style="color:#ffb200;font-weight:bold;">Comprobante rechazado</span>`;
    } else {
      li.innerHTML = `<span style="color:#ff4343;font-weight:bold;">Pendiente de aprobación</span>`;
    }
    ul.appendChild(li);
  });
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
 await actualizarPrecioTicket();
 // 1. Leer la cantidad de tickets visibles de la config
  const { data: conf } = await supabase.from('config')
    .select('valor')
    .eq('clave', 'tickets_visibles')
    .maybeSingle();

  // 2. Mostrar el valor actual en el input (por defecto 100 si no hay valor)
  document.getElementById('cantidadTicketsMostrar').value = conf?.valor || 100;

  const { data: confPrecio } = await supabase.from('config')
  .select('valor')
  .eq('clave', 'precio_ticket')
  .maybeSingle();
document.getElementById('nuevoPrecioTicket').value = confPrecio?.valor || 5;
  // 3. Cargar y mostrar los comprobantes como antes
  const { data, error } = await supabase
    .from('comprobantes')
    .select('*,usuarios(cedula,nombre,telefono)')
    .order('created_at', { ascending: false });

  let totalTickets = 0, totalMonto = 0;
  const lista = document.getElementById('listaComprobantes');
  lista.innerHTML = '';
  (data || []).forEach(c => {
    totalTickets += c.tickets.length;
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
    `Tickets vendidos: ${totalTickets} | Monto recaudado: ${totalMonto} Bs`;
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
  if (!confirm('¿Seguro de reiniciar? Esto borra todo (tickets, usuarios, comprobantes, y archivos de Storage).')) return;

  // 1. Libera todos los tickets asociados a comprobantes antes de borrar
  const { data: comprobantes, error: errorComp } = await supabase.from('comprobantes').select('tickets');
  if (errorComp) {
    console.error("Error consultando comprobantes:", errorComp);
    alert("Error consultando comprobantes: " + errorComp.message);
    return;
  }
  if (comprobantes && comprobantes.length) {
    // Junta todos los tickets asociados
    let todosLosTickets = [];
    comprobantes.forEach(c => { if (c.tickets && Array.isArray(c.tickets)) todosLosTickets = todosLosTickets.concat(c.tickets); });
    // Quita duplicados
    todosLosTickets = [...new Set(todosLosTickets)];
    // Libera todos los tickets
    for (let num of todosLosTickets) {
      await supabase
        .from('tickets')
        .update({ disponible: true, reservado_por: null, reservado_en: null })
        .eq('numero', num);
    }
  }

  // 2. Borra todos los comprobantes (con un WHERE trivial)
  await supabase.from('comprobantes').delete().not('id', 'is', null);

  // 3. Borra todos los usuarios (con un WHERE trivial)
  await supabase.from('usuarios').delete().not('id', 'is', null);

  // 4. Limpia todos los tickets (los deja disponibles)
  await supabase.from('tickets').update({
    disponible: true,
    reservado_por: null,
    reservado_en: null
  }).not('numero', 'is', null);

  // 5. Borra archivos del bucket Storage (solo raíz)
  const { data: archivos, error: errorArchivos } = await supabase.storage.from('comprobantes').list('', { limit: 1000 });
  if (!errorArchivos && archivos && archivos.length) {
    const nombres = archivos.map(f => f.name);
    await supabase.storage.from('comprobantes').remove(nombres);
  }

  // 6. Limpia el panel admin (UI) y recarga comprobantes
  document.getElementById('listaComprobantes').innerHTML = '';
  document.getElementById('totales').textContent = '';
  await cargarComprobantes();

  alert('¡Todos los datos han sido reiniciados!');
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
async function guardarCantidadTickets() {
  const cant = parseInt(document.getElementById('cantidadTicketsMostrar').value, 10) || 100;
  await supabase.from('config').upsert([{ clave: 'tickets_visibles', valor: cant }]);
  alert("Cantidad actualizada correctamente");
}
document.addEventListener('keydown', function(e) {
  // Puedes cambiar ALT + A por la combinación que prefieras
  if (e.altKey && e.key.toLowerCase() === 'a') {
    const adminBtn = document.getElementById('btnAdmin');
    if (adminBtn) {
      adminBtn.style.display = '';
      adminBtn.focus(); // Opcional: para que sea más visible
      // Oculta el botón de nuevo después de unos segundos, si quieres:
      setTimeout(() => { adminBtn.style.display = 'none'; }, 10000); // 10 segundos visible
    }
  }
});
// Recomendado: pon este código dentro de window.onload para evitar errores si el DOM aún no está listo.
window.onload = function() {
   mostrarFotoInicio();
  const mainTitle = document.getElementById('mainTitle');
  const adminBtn = document.getElementById('btnAdmin');
  
let adminTapCount = 0;
let adminTapTimer = null;

  function adminTapHandler() {
    adminTapCount++;
    if (adminTapCount === 5) { // Número de taps/clics secretos
      adminBtn.style.display = '';
      adminBtn.focus();
      adminTapCount = 0;
      // Oculta el botón después de 10 segundos (opcional)
      setTimeout(() => { adminBtn.style.display = 'none'; }, 10000);
    }
    clearTimeout(adminTapTimer);
    adminTapTimer = setTimeout(() => { adminTapCount = 0; }, 2000); // Si pasan 2 seg, resetea el contador
  }

  // Soporte móvil y desktop:
  mainTitle.addEventListener('click', adminTapHandler);
  mainTitle.addEventListener('touchend', adminTapHandler);

  // OPCIONAL: También acceso por teclado ALT+A en desktop
  document.addEventListener('keydown', function(e) {
    if (e.altKey && e.key.toLowerCase() === 'a') {
      adminBtn.style.display = '';
      adminBtn.focus();
      setTimeout(() => { adminBtn.style.display = 'none'; }, 10000);
    }
  });
};
async function guardarPrecioTicket() {
  const precio = parseInt(document.getElementById('nuevoPrecioTicket').value, 10) || 5;
  await supabase.from('config').upsert([{ clave: 'precio_ticket', valor: precio }]);
  alert("¡Precio actualizado correctamente!");
  // Recarga comprobantes y totales con el nuevo precio
  await cargarComprobantes();
}
// Subir la foto desde el panel admin
async function subirFotoInicio() {
  const fileInput = document.getElementById('fotoInicioInput');
  const file = fileInput.files[0];
  if (!file) {
    alert('Selecciona una imagen primero');
    return;
  }

  // Nombre único
  const nombreArchivo = `inicio_${Date.now()}.${file.name.split('.').pop()}`;
  const { data, error } = await supabase.storage
    .from('imagenes-inicio')
    .upload(nombreArchivo, file, { upsert: true });

  if (error) {
    alert("Error subiendo imagen: " + error.message);
    return;
  }

  // Obtener URL pública
  const { data: urlData } = supabase.storage.from('imagenes-inicio').getPublicUrl(nombreArchivo);
  const url = urlData.publicUrl;

  // Guardar la URL en config
  await supabase.from('config').upsert([{ clave: 'foto-inicio', valor: url }]); 
  alert('Foto de inicio actualizada');
  fileInput.value = '';
  mostrarFotoInicio(); // Refresca la imagen en pantalla
}

// Mostrar la foto en el inicio
async function mostrarFotoInicio() {
  const { data: conf } = await supabase.from('config')
    .select('valor')
    .eq('clave', 'foto-inicio')
    .maybeSingle();
  const fotoInicio = document.getElementById('fotoInicio');
  if (conf?.valor) {
    fotoInicio.src = conf.valor;
    fotoInicio.style.display = '';
  } else {
    fotoInicio.src = "";           // No muestra nada
    fotoInicio.style.display = 'none'; // Opcional: oculta el elemento si no hay imagen
  }
}


async function borrarFotoInicio() {
  if (!confirm('¿Seguro que quieres borrar la foto de inicio?')) return;

  // Obtén la URL de la foto desde config
  const { data: conf } = await supabase.from('config')
    .select('valor')
    .eq('clave', 'foto-inicio')
    .maybeSingle();

  if (conf?.valor) {
    // Extrae el nombre del archivo desde la URL
    // Ejemplo de URL: https://.../imagenes-inicio/inicio_1753291802562.png
    const partes = conf.valor.split('/');
    const nombreArchivo = partes[partes.length - 1];

    // Borra el archivo del bucket
    console.log("Intentando borrar archivo:", nombreArchivo);
    const { error: delError } = await supabase.storage
      .from('imagenes-inicio')
      .remove([nombreArchivo]);
    if (delError) {
      alert('Error borrando la imagen: ' + delError.message);
      return;
    }
  }

  // Borra la URL de la tabla config
  await supabase.from('config')
    .update({ valor: null })
    .eq('clave', 'foto-inicio');

  alert('Foto de inicio borrada');
  mostrarFotoInicio(); // Para refrescar la vista
}
async function cambiarClaveAdmin() {
  const claveActual = document.getElementById('adminClaveActual').value.trim();
  const claveNueva = document.getElementById('adminClaveNueva').value.trim();
  const claveNueva2 = document.getElementById('adminClaveNueva2').value.trim();

  if (!claveActual || !claveNueva || !claveNueva2) {
    alert('Completa todos los campos');
    return;
  }
  if (claveNueva.length < 5) {
    alert('La nueva clave debe tener al menos 5 caracteres');
    return;
  }
  if (claveNueva !== claveNueva2) {
    alert('Las nuevas claves no coinciden');
    return;
  }

  // Busca el admin logueado (puedes guardar el correo en variable global al loguear)
  const correo = document.getElementById('adminCorreo')?.value || localStorage.getItem("adminCorreo");
  if (!correo) {
    alert('No se puede determinar el usuario admin actual');
    return;
  }

  // Verifica clave actual
  const { data: admin, error } = await supabase
    .from('admins')
    .select('*')
    .eq('correo', correo)
    .maybeSingle();
  if (!admin || admin.clave_hash !== claveActual) {
    alert('Clave actual incorrecta');
    return;
  }

  // Actualiza la clave (en demo: almacena directo, en producción: guarda hash)
  const { error: updError } = await supabase
    .from('admins')
    .update({ clave_hash: claveNueva })
    .eq('correo', correo);

  if (updError) {
    alert('Error cambiando clave: ' + updError.message);
    return;
  }

  alert('¡Clave de admin cambiada!');
  // Limpia los campos
  document.getElementById('adminClaveActual').value = '';
  document.getElementById('adminClaveNueva').value = '';
  document.getElementById('adminClaveNueva2').value = '';
}
function toggleCambioClave() {
  const div = document.getElementById('divCambioClave');
  const btn = document.getElementById('btnMostrarClave');
  if (div.style.display === 'none') {
    div.style.display = '';
    btn.textContent = 'Ocultar cambio de clave';
  } else {
    div.style.display = 'none';
    btn.textContent = 'Cambiar clave admin';
    // Limpia los campos cuando se oculta
    document.getElementById('adminClaveActual').value = '';
    document.getElementById('adminClaveNueva').value = '';
    document.getElementById('adminClaveNueva2').value = '';
  }
}
async function actualizarContadorTickets() {
  // Total de tickets
  const { count: totalTickets } = await supabase
    .from('tickets')
    .select('*', { count: 'exact', head: true });

  // Tickets disponibles actualmente
  const { count: disponibles } = await supabase
    .from('tickets')
    .select('*', { count: 'exact', head: true })
    .eq('disponible', true);

  // Actualiza el contador en pantalla (solo si el elemento existe)
  const el = document.getElementById('ticketContador');
  if (el) {
    el.textContent = `${disponibles} de ${totalTickets} disponibles`;
  }
}
