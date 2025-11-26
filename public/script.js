// script.js - Frontend con auth, carrito, fondos y rol-based UI
let currentUser = null;
let fondosUsuario = 0;

document.addEventListener('DOMContentLoaded', () => {
  // elementos auth
  window.formRegister = document.getElementById('formRegister');
  window.formLogin = document.getElementById('formLogin');
  window.authOverlay = document.getElementById('authOverlay');
  window.mainApp = document.getElementById('mainApp');
  window.btnAgregarPan = document.getElementById('btnAgregarPan');
  window.btnCarrito = document.getElementById('btnCarrito');
  window.badgeCarrito = document.getElementById('badgeCarrito');
  window.btnPerfil = document.getElementById('btnPerfil');
  window.logoutBtn = document.getElementById('logoutBtn');

  // switch login/register
  document.getElementById('switchToLogin').addEventListener('click', (e) => {
    e.preventDefault();
    showLogin();
  });
  document.getElementById('switchToRegister').addEventListener('click', (e) => {
    e.preventDefault();
    showRegister();
  });

  formRegister.addEventListener('submit', handleRegister);
  formLogin.addEventListener('submit', handleLogin);
  logoutBtn.addEventListener('click', handleLogout);

  btnCarrito.addEventListener('click', () => {
    new bootstrap.Modal(document.getElementById('modalCarrito')).show();
    cargarCarrito();
  });

  // Form producto
  document.getElementById('formProducto').addEventListener('submit', guardarProducto);
  document.getElementById('modalProducto').addEventListener('hidden.bs.modal', () => {
    document.getElementById('formProducto').reset();
    document.getElementById('id_producto').value = '';
    document.getElementById('mensajeError').classList.add('d-none');
  });

  // Botón Conócenos
  document.getElementById("btnConocenos").addEventListener("click", () => {
    new bootstrap.Modal(document.getElementById("modalConocenos")).show();
  });

  // Form nuevo usuario
  document.getElementById("formNuevoUsuario").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("nuevoNombre").value.trim();
    const email = document.getElementById("nuevoEmail").value.trim();
    const rol = document.getElementById("nuevoRol").value;
    if (!nombre || !email) return;

    const res = await fetch("/usuarios/agregar", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ nombre, email, rol })
    }).then(r=>r.json());

    if (res.error) showToast(res.error, "error");
    else {
      document.getElementById("formNuevoUsuario").reset();
      cargarUsuarios();
    }
  });

  // Reset password
  document.getElementById("formResetPassword").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("resetNombre").value.trim();
    const email = document.getElementById("resetEmail").value.trim();
    const newPassword = document.getElementById("resetPassword").value;

    try {
      const res = await fetch("/resetPassword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, email, newPassword })
      });
      const data = await res.json();

      if (res.ok) {
        showToast("Contraseña cambiada correctamente. Ya puedes iniciar sesión.", "success");
      } else {
        showToast(data.error, "error");
      }
    } catch (err) {
      showToast("Error al conectar con el servidor.", "error");
    }
  });

  // Checkout
  document.getElementById('btnCheckout').addEventListener('click', handleCheckout);

  // Inicializar estado: si ya hay sesión, entrar
  fetch('/me').then(r => r.json()).then(data => {
    if (data.user) {
      onLogin(data.user);
    } else {
      showRegister();
    }
    cargarGaleria();
    actualizarBadge();
  });
});

// AUTENTICACIÓN

function showLogin() {
  document.getElementById('authTitle').textContent = 'Iniciar sesión';
  document.getElementById('formRegister').classList.add('d-none');
  document.getElementById('formLogin').classList.remove('d-none');
  document.getElementById('authError').classList.add('d-none');
  document.getElementById('loginError').classList.add('d-none');
}

function showRegister() {
  document.getElementById('authTitle').textContent = 'Crear cuenta';
  document.getElementById('formRegister').classList.remove('d-none');
  document.getElementById('formLogin').classList.add('d-none');
  document.getElementById('authError').classList.add('d-none');
}

async function handleRegister(e) {
  e.preventDefault();
  const nombre = document.getElementById('regNombre').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const rol = document.getElementById('rolInput') ? document.getElementById('rolInput').value : 'cliente';

  const resp = await fetch('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, email, password, rol })
  }).then(r => r.json());

  if (resp.error) {
    const el = document.getElementById('authError');
    el.textContent = resp.error;
    el.classList.remove('d-none');
    return;
  }
  
  showToast("Registro exitoso. Iniciando sesión...", "success");
  onLogin(resp.user);
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('logEmail').value.trim();
  const password = document.getElementById('logPassword').value;

  const resp = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  }).then(r => r.json());

  if (resp.error) {
    const el = document.getElementById('loginError');
    el.textContent = resp.error;
    el.classList.remove('d-none');
    return;
  }
  onLogin(resp.user);
}

async function handleLogout(e) {
  e.preventDefault();
  await fetch('/logout', { method: 'POST' }).then(r => r.json());
  document.getElementById('authOverlay').classList.remove('d-none');
  document.getElementById('mainApp').style.display = 'none';
  currentUser = null;
  fondosUsuario = 0;
  showRegister();
  actualizarBadge();
}

function onLogin(user) {
  currentUser = user;
  document.getElementById('authOverlay').classList.add('d-none');
  document.getElementById('mainApp').style.display = 'block';

  if (user.rol === 'admin') {
    document.getElementById('btnAgregarPan').style.display = 'inline-block';
  } else {
    document.getElementById('btnAgregarPan').style.display = 'none';
  }

  actualizarPerfilDropdown();
  actualizarBadge();
  cargarProductos();
  cargarFondos();
}

// SISTEMA DE FONDOS

async function cargarFondos() {
  if (!currentUser) return;
  
  try {
    const resp = await fetch('/fondos').then(r => r.json());
    fondosUsuario = parseFloat(resp.fondos) || 0;
    actualizarDisplayFondos();
  } catch (err) {
    console.error('Error al cargar fondos:', err);
  }
}

function actualizarDisplayFondos() {
  if (fondosUsuario == null || isNaN(fondosUsuario)) {
    fondosUsuario = 0;
  }

  const fondosElement = document.getElementById('fondosDisplay');
  if (!fondosElement) {
    console.warn("fondosDisplay no existe todavía.");
    return;
  }

  fondosElement.textContent = `$${fondosUsuario.toFixed(2)}`;
}


async function agregarFondos() {
  const cantidad = prompt('¿Cuánto dinero deseas agregar?\n(Máximo: $999,999,999,999)');
  
  if (cantidad === null || cantidad.trim() === '') return;
  
  const cantidadNum = parseFloat(cantidad);
  
  if (isNaN(cantidadNum) || cantidadNum <= 0) {
    showToast('Por favor ingresa una cantidad válida.', 'error');
    return;
  }
  
  if (cantidadNum > 999999999999) {
    showToast('No puedes agregar más de $999,999,999,999 de una sola vez.', 'error');
    return;
  }
  
  try {
    const resp = await fetch('/fondos/agregar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cantidad: cantidadNum })
    }).then(r => r.json());
    
    if (resp.error) {
      showToast(resp.error, 'error');
      return;
    }
    
    fondosUsuario = parseFloat(resp.fondos);
    actualizarDisplayFondos();
    showToast(`¡Fondos agregados! Nuevo saldo: $${resp.fondos.toFixed(2)}`, 'success');
  } catch (err) {
    showToast('Error al agregar fondos.', 'error');
  }
}

// PERFIL DROPDOWN

function actualizarPerfilDropdown() {
  const menu = document.getElementById('perfilDropdown');
  menu.innerHTML = '';
  
  // Nombre del usuario
  const liNombre = document.createElement('li');
  liNombre.innerHTML = `<h6 class="dropdown-header">${escapeHtml(currentUser.nombre)}</h6>`;
  menu.appendChild(liNombre);
  
  // Fondos disponibles
  const liFondos = document.createElement('li');
  liFondos.innerHTML = `
    <div class="dropdown-item-text">
      <strong>💰 Fondos:</strong> 
      <span id="fondosDisplay" class="text-success fw-bold">$${fondosUsuario.toFixed(2)}</span>
    </div>
  `;
  menu.appendChild(liFondos);
  
  // Botón agregar fondos
  const liAgregarFondos = document.createElement('li');
  liAgregarFondos.innerHTML = `
    <a class="dropdown-item" href="#" id="btnAgregarFondos">
      <i class="bi bi-wallet2"></i> Agregar Fondos
    </a>
  `;
  menu.appendChild(liAgregarFondos);
  
  // Historial de compras
  const liHistorial = document.createElement('li');
  liHistorial.innerHTML = `
    <a class="dropdown-item" href="#" id="btnHistorial">
      <i class="bi bi-clock-history"></i> Mis Compras
    </a>
  `;
  menu.appendChild(liHistorial);
  
  // Si es admin, agregar opciones de admin
  if (currentUser.rol === 'admin') {
    const liDivider = document.createElement('li');
    liDivider.innerHTML = `<hr class="dropdown-divider">`;
    menu.appendChild(liDivider);
    
    const liGestionUsuarios = document.createElement('li');
    liGestionUsuarios.innerHTML = `
      <a class="dropdown-item" href="#" id="gestionarUsuarios">
        <i class="bi bi-people-fill"></i> Gestionar Usuarios
      </a>
    `;
    menu.appendChild(liGestionUsuarios);
    
    const liGraficos = document.createElement('li');
    liGraficos.innerHTML = `
      <a class="dropdown-item" href="#" id="verGraficos">
        <i class="bi bi-graph-up"></i> Ver Estadísticas
      </a>
    `;
    menu.appendChild(liGraficos);
  }
  
  // Logout
  const liLogout = document.createElement('li');
  liLogout.innerHTML = `
    <hr class="dropdown-divider">
    <a class="dropdown-item text-danger" href="#" id="logoutBtn2">
      <i class="bi bi-box-arrow-right"></i> Cerrar Sesión
    </a>
  `;
  menu.appendChild(liLogout);
  
  // Asignar eventos
  setTimeout(() => {
    const btnAF = document.getElementById('btnAgregarFondos');
    if (btnAF) btnAF.addEventListener('click', (e) => {
      e.preventDefault();
      agregarFondos();
    });
    
    const btnH = document.getElementById('btnHistorial');
    if (btnH) btnH.addEventListener('click', (e) => {
      e.preventDefault();
      abrirHistorialCompras();
    });
    
    const btnGU = document.getElementById('gestionarUsuarios');
    if (btnGU) btnGU.addEventListener('click', (e) => {
      e.preventDefault();
      cargarUsuarios();
      new bootstrap.Modal(document.getElementById('modalUsuarios')).show();
    });
    
    const btnG = document.getElementById('verGraficos');
    if (btnG) btnG.addEventListener('click', (e) => {
      e.preventDefault();
      abrirGraficos();
    });
    
    const l = document.getElementById('logoutBtn2');
    if (l) l.addEventListener('click', handleLogout);
  }, 10);
}


// PRODUCTOS

function cargarProductos() {
  fetch('/productos')
    .then(res => res.json())
    .then(productos => {
      const tbody = document.querySelector('#tablaProductos tbody');
      tbody.innerHTML = '';
      productos.forEach((prod, idx) => {
        const imgSrc = prod.tiene_imagen
        ? `/imagen/${prod.id_producto}?t=${Date.now()}`
        : 'https://via.placeholder.com/150?text=Sin+Imagen';

        let acciones = '';
        if (currentUser && currentUser.rol === 'admin') {
          acciones = `
            <button class="btn btn-sm btn-warning me-1 btn-editar" data-prod='${JSON.stringify(prod).replace(/'/g, "&#39;")}' type="button">Editar</button>
            <button class="btn btn-sm btn-danger btn-borrar" data-id="${prod.id_producto}" type="button">Borrar</button>
          `;
        } else {
          acciones = `<button class="btn btn-sm btn-primary btn-agregar-carrito" data-id="${prod.id_producto}" ${prod.stock<=0? 'disabled':''}>Agregar al carrito</button>`;
        }
        tbody.innerHTML += `
          <tr>
            <td>${idx + 1}</td>
            <td><img src="${imgSrc}" alt="pan" class="img-thumbnail" style="width:60px;height:60px;object-fit:cover;"></td>
            <td>${escapeHtml(prod.nombre)}</td>
            <td>${escapeHtml(prod.descripcion || '')}</td>
            <td>$${Number(prod.precio).toFixed(2)}</td>
            <td>${prod.stock}</td>
            <td>${acciones}</td>
          </tr>
        `;
      });
      
      document.querySelectorAll('.btn-editar').forEach(btn => {
        btn.addEventListener('click', function() {
          editarProducto(this.getAttribute('data-prod'));
        });
      });
      
      document.querySelectorAll('.btn-borrar').forEach(btn => {
        btn.addEventListener('click', function() {
          borrarProducto(this.getAttribute('data-id'));
        });
      });
      
      document.querySelectorAll('.btn-agregar-carrito').forEach(btn => {
        btn.addEventListener('click', function() {
          agregarAlCarrito(this.getAttribute('data-id'));
        });
      });
    });
}

function guardarProducto(e) {
  e.preventDefault();
  const form = e.target;
  const id = form.id_producto.value;
  const nombre = form.nombre.value.trim();
  const descripcion = form.descripcion.value.trim();
  const precio = form.precio.value;
  const stock = form.stock.value;
  const imagenInput = form.imagen;
  const mensajeError = document.getElementById('mensajeError');
  mensajeError.classList.add('d-none');

  if (!nombre || !precio || !stock || precio <= 0 || stock < 0) {
    mensajeError.textContent = 'Todos los campos obligatorios deben ser válidos.';
    mensajeError.classList.remove('d-none');
    return;
  }
  
  const etiquetaRegex = /<[^>]*>|<\?php.*?\?>/i;
  const numeroRegex = /\d/;
  if (etiquetaRegex.test(nombre) || etiquetaRegex.test(descripcion)) {
    mensajeError.textContent = 'No se permiten etiquetas HTML, JS o PHP en el nombre o la descripción.';
    mensajeError.classList.remove('d-none');
    return;
  }
  if (numeroRegex.test(nombre) || numeroRegex.test(descripcion)) {
    mensajeError.textContent = 'No se permiten números en el nombre o la descripción.';
    mensajeError.classList.remove('d-none');
    return;
  }

  const formData = new FormData();
  formData.append('nombre', nombre);
  formData.append('descripcion', descripcion);
  formData.append('precio', precio);
  formData.append('stock', stock);
  if (imagenInput.files && imagenInput.files[0]) {
    formData.append('imagen', imagenInput.files[0]);
  }
  
  let url = '/agregarProducto';
  if (id) {
    formData.append('id_producto', id);
    url = '/actualizarProducto';
  }

  fetch(url, { method: 'POST', body: formData })
    .then(res => res.json())
    .then(resp => {
      if (resp.error) {
        mensajeError.textContent = resp.error;
        mensajeError.classList.remove('d-none');
      } else {
        bootstrap.Modal.getOrCreateInstance(document.getElementById('modalProducto')).hide();
        form.reset();
        cargarProductos();
      }
    });
}

function editarProducto(prodStr) {
  let prod;
  try { prod = JSON.parse(prodStr); } catch { prod = JSON.parse(decodeURIComponent(prodStr)); }
  document.getElementById('id_producto').value = prod.id_producto;
  document.getElementById('nombre').value = prod.nombre;
  document.getElementById('descripcion').value = prod.descripcion || '';
  document.getElementById('precio').value = prod.precio;
  document.getElementById('stock').value = prod.stock;
  document.getElementById('imagen').value = '';
  document.getElementById('mensajeError').classList.add('d-none');
  const modal = new bootstrap.Modal(document.getElementById('modalProducto'));
  modal.show();
}

function borrarProducto(id) {
  if (!confirm('¿Seguro que deseas borrar este pan?')) return;
  fetch('/borrarProducto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_producto: id })
  }).then(r => r.json()).then(resp => {
    if (resp.error) showToast(resp.error, "error");
    else {
      cargarProductos();
      showToast("Producto eliminado", "success");
    }
  });
}

// GALERÍA
function cargarGaleria() {
  const panes = [
    { nombre: 'Pan de Muerto', descripcion: 'Tradicional pan mexicano decorado con "huesitos" de masa y azúcar.', precio: 25, img: 'https://images.pexels.com/photos/19132888/pexels-photo-19132888.jpeg' },
    { nombre: 'Calaverita de Azúcar', descripcion: 'Dulce típico de Día de Muertos hecho de azúcar y decorado a mano.', precio: 15, img: 'https://images.pexels.com/photos/5702776/pexels-photo-5702776.jpeg' },
    { nombre: 'Pan de Calabaza', descripcion: 'Pan suave y esponjoso hecho con puré de calabaza y especias.', precio: 30, img: 'https://images.pexels.com/photos/6211080/pexels-photo-6211080.jpeg' },
    { nombre: 'Pan Fantasma', descripcion: 'Pan decorado con forma de fantasma, ideal para Halloween.', precio: 18, img: 'https://images.pexels.com/photos/1304543/pexels-photo-1304543.jpeg' }
  ];
  const galeria = document.getElementById('galeria');
  galeria.innerHTML = panes.map(pan => `
    <div class="col-6 col-md-3">
      <div class="card shadow-sm h-100">
        <img src="${pan.img}" class="card-img-top" alt="${pan.nombre}" style="object-fit:cover;height:180px;">
        <div class="card-body text-center">
          <h6 class="card-title mb-1">${pan.nombre}</h6>
          <p class="card-text small mb-1">${pan.descripcion}</p>
          <span class="badge bg-warning text-dark">$${pan.precio}.00</span>
        </div>
      </div>
    </div>
  `).join('');
}

// CARRITO
async function agregarAlCarrito(id_producto) {
  if (!currentUser) return showToast('Debes iniciar sesión para agregar al carrito.', "warning");
  
  const productoResp = await fetch('/productos').then(r => r.json());
  const producto = productoResp.find(p => p.id_producto == id_producto);
  
  if (!producto) {
    return showToast('Producto no encontrado.', "error");
  }
  
  if (producto.stock <= 0) {
    return showToast('Este producto está agotado.', "warning");
  }
  
  const carritoResp = await fetch('/carrito').then(r => r.json());
  const itemEnCarrito = (carritoResp.items || []).find(it => it.id_producto == id_producto);
  const cantidadEnCarrito = itemEnCarrito ? itemEnCarrito.cantidad : 0;
  
  if (cantidadEnCarrito >= producto.stock) {
    return showToast(`No puedes agregar más. Stock disponible: ${producto.stock}`, "warning");
  }
  
  const cantidad = 1;
  const resp = await fetch('/carrito/agregar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_producto: Number(id_producto), cantidad })
  }).then(r => r.json());
  
  if (resp.error) return showToast(resp.error, "error");
  
  showToast('Agregado al carrito.', "success");
  actualizarBadge();
}

async function cargarCarrito() {
  const resp = await fetch('/carrito').then(r => r.json());
  const items = resp.items || [];
  const container = document.getElementById('carritoItems');
  
  if (items.length === 0) {
    container.innerHTML = '<p>Tu carrito está vacío.</p>';
    document.getElementById('carritoTotal').textContent = '0.00';
    return;
  }
  
  const productosResp = await fetch('/productos').then(r => r.json());
  
  container.innerHTML = items.map(it => {
    const producto = productosResp.find(p => p.id_producto == it.id_producto);
    const stockDisponible = producto ? producto.stock : 0;
    const maxCantidad = stockDisponible;
    
    return `
      <div class="d-flex align-items-center justify-content-between border-bottom py-2">
        <div>
          <strong>${escapeHtml(it.nombre)}</strong><br>
          Precio unitario: $${Number(it.precio).toFixed(2)}<br>
          <small class="text-muted">Stock disponible: ${stockDisponible}</small>
          ${it.cantidad > stockDisponible ? '<br><span class="badge bg-danger">¡Cantidad excede stock!</span>' : ''}
        </div>
        <div class="d-flex align-items-center gap-2">
          <input data-id="${it.id_carrito}" 
                data-producto-id="${it.id_producto}"
                class="form-control form-control-sm qty-input" 
                type="number" 
                min="1" 
                max="${maxCantidad}"
                style="width:80px;" 
                value="${Math.min(it.cantidad, maxCantidad)}">
          <button class="btn btn-sm btn-danger btn-eliminar" data-id="${it.id_carrito}">Eliminar</button>
        </div>
      </div>
    `;
  }).join('');
  
  document.querySelectorAll('.qty-input').forEach(input => {
    input.addEventListener('change', async function() {
      const id = this.dataset.id;
      let cantidad = Number(this.value);
      const max = Number(this.max);
      
      if (cantidad <= 0) { 
        this.value = 1; 
        cantidad = 1;
      }
      
      if (cantidad > max) {
        this.value = max;
        cantidad = max;
        showToast(`Stock disponible: ${max} unidades`, "warning");
      }
      
      const r = await fetch('/carrito/actualizar', {
        method: 'POST', 
        headers: {'Content-Type':'application/json'}, 
        body: JSON.stringify({ id_carrito: id, cantidad })
      }).then(r => r.json());
      
      if (r.error) showToast(r.error, "error");
      cargarCarrito();
      actualizarBadge();
    });
  });
  
  document.querySelectorAll('.btn-eliminar').forEach(btn => {
    btn.addEventListener('click', async function() {
      const id = this.dataset.id;
      await fetch('/carrito/eliminar', { 
        method: 'POST', 
        headers: {'Content-Type':'application/json'}, 
        body: JSON.stringify({ id_carrito: id }) 
      }).then(r => r.json());
      cargarCarrito();
      actualizarBadge();
    });
  });

  const total = items.reduce((s, it) => s + (Number(it.precio) * Number(it.cantidad)), 0);
  document.getElementById('carritoTotal').textContent = total.toFixed(2);
}

async function actualizarBadge() {
  const resp = await fetch('/carrito').then(r => r.json());
  const count = (resp.items || []).reduce((s, it) => s + Number(it.cantidad), 0);
  badgeCarrito.textContent = count;
  badgeCarrito.style.display = count > 0 ? 'inline-block' : 'none';
}

// CHECKOUT

async function handleCheckout() {
  try {
    // 1. Obtener carrito
    const carritoResp = await fetch('/carrito').then(r => r.json());
    const items = carritoResp.items || [];

    if (items.length === 0) {
      return showToast('Tu carrito está vacío.', "warning");
    }

    // 2. Obtener productos actuales
    const productosResp = await fetch('/productos').then(r => r.json());

    // 3. Validar stock
    let hayErrorStock = false;
    for (const item of items) {
      const producto = productosResp.find(p => p.id_producto == item.id_producto);
      if (!producto || producto.stock < item.cantidad) {
        hayErrorStock = true;
        showToast(
          `Stock insuficiente de "${item.nombre}". Disponible: ${producto ? producto.stock : 0}, en carrito: ${item.cantidad}`, 
          'error'
        );
      }
    }
    
    if (hayErrorStock) {
      showToast('Por favor ajusta las cantidades en tu carrito.', 'warning');
      await cargarCarrito();
      return;
    }

    // 4. Calcular total
    const total = items.reduce((s, it) => s + (Number(it.precio) * Number(it.cantidad)), 0);

    // 5. Recargar fondos
    await cargarFondos();

    // 6. Validar fondos
    if (fondosUsuario < total) {
      showToast(
        `Fondos insuficientes. Necesitas $${total.toFixed(2)} pero tienes $${fondosUsuario.toFixed(2)}`, 
        'error'
      );
      return;
    }

    // 7. Confirmar compra
    const confirmacion = confirm(
      `¿Confirmar compra?\n\n` +
      `Total: $${total.toFixed(2)}\n` +
      `Fondos disponibles: $${fondosUsuario.toFixed(2)}\n` +
      `Fondos restantes: $${(fondosUsuario - total).toFixed(2)}`
    );

    if (!confirmacion) return;

    // 8. Procesar compra
    const response = await fetch('/carrito/checkout', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const r = await response.json();

    if (!response.ok || r.error) {
      showToast(r.error || 'Error al procesar la compra', "error");
      return;
    }

    // 9. Actualizar fondos localmente
    fondosUsuario = parseFloat(r.fondosRestantes);
    actualizarDisplayFondos();

    // 10. Mostrar confirmación
    showToast(`¡Compra exitosa! Total: $${total.toFixed(2)}`, "success");

    // 11. Actualizar interfaz
    await cargarProductos();
    await cargarCarrito();
    await actualizarBadge();

    // 12. Cerrar modal del carrito
    bootstrap.Modal.getOrCreateInstance(document.getElementById('modalCarrito')).hide();

    // 13. MOSTRAR TICKET - AQUÍ ESTABA EL PROBLEMA
    setTimeout(() => {
      mostrarTicket({
        id_venta: r.id_venta,
        total: total,
        fondos_restantes: r.fondosRestantes,
        fecha: new Date(),
        items: items // Pasar los items comprados
      });
    }, 500);

  } catch (err) {
    console.error('Error en checkout:', err);
    showToast('Error al procesar la compra.', 'error');
  }
}


// USUARIOS (ADMIN)
async function cargarUsuarios() {
  const res = await fetch('/usuarios');
  const usuarios = await res.json();
  const tbody = document.getElementById('usuariosTabla');
  tbody.innerHTML = '';
  usuarios.forEach((u, i) => {
    tbody.innerHTML += `
      <tr>
        <td>${i+1}</td>
        <td>${escapeHtml(u.nombre)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${u.rol}</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="eliminarUsuario(${u.id_usuario})">Eliminar</button>
        </td>
      </tr>
    `;
  });
}

async function eliminarUsuario(id) {
  if (!confirm('¿Seguro que deseas eliminar este usuario?')) return;
  const res = await fetch('/usuarios/eliminar', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ id })
  }).then(r=>r.json());
  if (res.error) showToast(res.error, "error");
  else cargarUsuarios();
}

// PLACEHOLDERS
function abrirHistorialCompras() {
  showToast('Historial de compras - Próximamente', 'info');
}

function abrirGraficos() {
  showToast('Estadísticas - Próximamente', 'info');
}

// UTILIDADES
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const id = "toast-" + Date.now();

  let bg = "bg-success";
  if (type === "error") bg = "bg-danger";
  if (type === "info") bg = "bg-primary";
  if (type === "warning") bg = "bg-warning text-dark";

  const toast = document.createElement("div");
  toast.id = id;
  toast.className = `toast align-items-center text-white ${bg} border-0 mb-2 show`;
  toast.role = "alert";
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe).replace(/[&<>"']/g, function(m){ 
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]; 
  });
}

// AGREGAR ESTAS FUNCIONES AL FINAL DE script.js

// Función para mostrar el ticket
async function mostrarTicket(venta) {
  try {
    // Llenar datos del ticket
    document.getElementById('ticketNumVenta').textContent = `#${venta.id_venta}`;
    
    // Formatear fecha
    const fecha = new Date(venta.fecha);
    const fechaFormateada = fecha.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    document.getElementById('ticketFecha').textContent = fechaFormateada;
    
    // Cliente
    document.getElementById('ticketCliente').textContent = currentUser.nombre;
    
    // Productos
    const productosHTML = venta.items.map((prod, index) => `
      <div class="d-flex justify-content-between mb-2 pb-2" style="border-bottom: 1px dashed #e0e0e0;">
        <div style="flex: 1;">
          <span class="fw-semibold" style="color: #3e2723;">${index + 1}. ${prod.nombre}</span><br>
          <small style="color: #5d4037;">${prod.cantidad} x $${parseFloat(prod.precio).toFixed(2)}</small>
        </div>
        <div class="text-end">
          <span class="fw-bold" style="color: #d4af37;">$${(parseFloat(prod.precio) * parseInt(prod.cantidad)).toFixed(2)}</span>
        </div>
      </div>
    `).join('');
    
    document.getElementById('ticketProductos').innerHTML = productosHTML;
    
    // Total
    document.getElementById('ticketTotal').textContent = `$${parseFloat(venta.total).toFixed(2)}`;
    document.getElementById('ticketFondosRestantes').textContent = `$${parseFloat(venta.fondos_restantes).toFixed(2)}`;
    
    // Mostrar modal
    const modal = new bootstrap.Modal(document.getElementById('modalTicket'));
    modal.show();
    
  } catch (error) {
    console.error('Error al mostrar ticket:', error);
    showToast('Error al mostrar el ticket', 'error');
  }
}

// Función alternativa si no hay endpoint de detalles
function mostrarTicketSimple(venta) {
  document.getElementById('ticketNumVenta').textContent = `#${venta.id_venta}`;
  
  const fecha = new Date(venta.fecha);
  const fechaFormateada = fecha.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  document.getElementById('ticketFecha').textContent = fechaFormateada;
  document.getElementById('ticketCliente').textContent = currentUser.nombre;
  
  // Sin productos específicos
  document.getElementById('ticketProductos').innerHTML = `
    <div class="text-center p-3" style="background: rgba(212, 175, 55, 0.1); border-radius: 8px;">
      <p class="mb-0" style="color: #5d4037;">Compra realizada exitosamente</p>
    </div>
  `;
  
  document.getElementById('ticketTotal').textContent = `$${parseFloat(venta.total).toFixed(2)}`;
  document.getElementById('ticketFondosRestantes').textContent = `$${parseFloat(venta.fondos_restantes).toFixed(2)}`;
  
  const modal = new bootstrap.Modal(document.getElementById('modalTicket'));
  modal.show();
}

// Función para descargar el ticket como imagen/PDF
document.addEventListener('DOMContentLoaded', () => {
  // Esperar un momento para que html2canvas y jsPDF se carguen
  setTimeout(() => {
    const btnDescargar = document.getElementById('btnDescargarTicket');
    if (btnDescargar) {
      btnDescargar.addEventListener('click', async () => {
        const ticketContent = document.getElementById('ticketContent');
        
        try {
          // Verificar que las librerías estén cargadas
          if (typeof html2canvas === 'undefined') {
            showToast('Error: html2canvas no está cargado', 'error');
            return;
          }
          
          if (typeof window.jspdf === 'undefined') {
            showToast('Error: jsPDF no está cargado', 'error');
            return;
          }
          
          // Mostrar mensaje de espera
          btnDescargar.disabled = true;
          btnDescargar.innerHTML = '<i class="bi bi-hourglass-split"></i> Generando...';
          
          // Capturar el contenido como imagen
          const canvas = await html2canvas(ticketContent, {
            backgroundColor: '#fff8e1',
            scale: 2,
            logging: false,
            useCORS: true
          });
          
          // Convertir a PDF
          const imgData = canvas.toDataURL('image/png');
          const { jsPDF } = window.jspdf;
          const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a5'
          });
          
          const imgWidth = 148;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          
          pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
          
          // Descargar
          const numVenta = document.getElementById('ticketNumVenta').textContent;
          pdf.save(`Ticket_${numVenta}_Panaderia_La_Desesperanza.pdf`);
          
          showToast('¡Ticket descargado exitosamente!', 'success');
          
        } catch (error) {
          console.error('Error al descargar ticket:', error);
          showToast('Error al descargar el ticket: ' + error.message, 'error');
        } finally {
          // Restaurar botón
          btnDescargar.disabled = false;
          btnDescargar.innerHTML = '<i class="bi bi-download"></i> Descargar Ticket';
        }
      });
    }
  }, 1000);
});

// AGREGAR AL FINAL DE script.js

// Función para abrir el historial de compras
async function abrirHistorialCompras() {
  try {
    const modal = new bootstrap.Modal(document.getElementById('modalHistorial'));
    
    // Configurar el modal según el rol
    if (currentUser.rol === 'admin') {
      document.getElementById('tituloHistorial').textContent = 'TODAS LAS COMPRAS';
      document.getElementById('filtrosHistorial').style.display = 'block';
      document.getElementById('estadisticasHistorial').style.display = 'block';
      
      // Cargar estadísticas
      await cargarEstadisticas();
      
      // Cargar todas las compras
      await cargarHistorialAdmin();
    } else {
      document.getElementById('tituloHistorial').textContent = 'MIS COMPRAS';
      document.getElementById('filtrosHistorial').style.display = 'none';
      document.getElementById('estadisticasHistorial').style.display = 'none';
      
      // Cargar solo las compras del usuario
      await cargarMisCompras();
    }
    
    modal.show();
  } catch (err) {
    console.error('Error al abrir historial:', err);
    showToast('Error al cargar el historial', 'error');
  }
}

// Cargar las compras del usuario actual
async function cargarMisCompras() {
  try {
    const resp = await fetch('/historial/mis-compras').then(r => r.json());
    
    if (resp.error) {
      showToast(resp.error, 'error');
      return;
    }
    
    mostrarCompras(resp.compras);
  } catch (err) {
    console.error('Error al cargar mis compras:', err);
    showToast('Error al cargar las compras', 'error');
  }
}

// Cargar todas las compras (admin)
async function cargarHistorialAdmin(filtros = {}) {
  try {
    let url = '/historial/todas';
    const params = new URLSearchParams(filtros);
    if (params.toString()) {
      url += '?' + params.toString();
    }
    
    const resp = await fetch(url).then(r => r.json());
    
    if (resp.error) {
      showToast(resp.error, 'error');
      return;
    }
    
    mostrarCompras(resp.compras);
  } catch (err) {
    console.error('Error al cargar historial admin:', err);
    showToast('Error al cargar el historial', 'error');
  }
}

// Cargar estadísticas (admin)
async function cargarEstadisticas() {
  try {
    const resp = await fetch('/historial/estadisticas').then(r => r.json());
    
    if (resp.error) {
      console.error('Error al cargar estadísticas:', resp.error);
      return;
    }
    
    // Actualizar estadísticas
    document.getElementById('statTotalVentas').textContent = resp.total_ventas;
    document.getElementById('statIngresos').textContent = `$${resp.ingresos_totales.toFixed(2)}`;
    
    if (resp.productos_mas_vendidos.length > 0) {
      document.getElementById('statTopProducto').textContent = resp.productos_mas_vendidos[0].nombre;
    } else {
      document.getElementById('statTopProducto').textContent = '-';
    }
  } catch (err) {
    console.error('Error al cargar estadísticas:', err);
  }
}

// Mostrar las compras en el modal
function mostrarCompras(compras) {
  const container = document.getElementById('listaCompras');
  const sinCompras = document.getElementById('sinCompras');
  
  if (!compras || compras.length === 0) {
    container.innerHTML = '';
    sinCompras.style.display = 'block';
    return;
  }
  
  sinCompras.style.display = 'none';
  
  container.innerHTML = compras.map((compra, index) => {
    const fecha = new Date(compra.fecha);
    const fechaFormateada = fecha.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const productosHTML = compra.productos.map(prod => `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <span style="color: #5d4037;">
          <i class="bi bi-dot"></i> ${prod.nombre} (x${prod.cantidad})
        </span>
        <span class="fw-semibold" style="color: #d4af37;">$${parseFloat(prod.subtotal).toFixed(2)}</span>
      </div>
    `).join('');
    
    return `
      <div class="card mb-3" style="border: 3px solid #27ae60; background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%); overflow: hidden;">
        <div class="card-body">
          <div class="row">
            <div class="col-md-8">
              <div class="d-flex align-items-center mb-3">
                <div class="rounded-circle p-3 me-3" style="background: linear-gradient(135deg, #27ae60 0%, #229954 100%); width: 60px; height: 60px; display: flex; align-items: center; justify-content: center;">
                  <i class="bi bi-receipt-cutoff" style="font-size: 1.8rem; color: white;"></i>
                </div>
                <div>
                  <h5 class="mb-1 fw-bold" style="color: #3e2723;">Compra #${compra.id_venta}</h5>
                  <p class="mb-0 text-muted">
                    <i class="bi bi-calendar3"></i> ${fechaFormateada}
                    ${currentUser.rol === 'admin' ? `<br><i class="bi bi-person"></i> ${compra.cliente}` : ''}
                  </p>
                </div>
              </div>
              
              <div class="mb-3">
                <h6 class="fw-bold mb-2" style="color: #5d4037;">
                  <i class="bi bi-bag-fill"></i> Productos:
                </h6>
                ${productosHTML}
              </div>
            </div>
            
            <div class="col-md-4 d-flex flex-column justify-content-center align-items-end">
              <div class="text-center p-3 rounded mb-3" style="background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%); border: 2px solid #f39c12; min-width: 180px;">
                <p class="mb-1 fw-semibold" style="color: #5d4037;">TOTAL PAGADO</p>
                <h3 class="mb-0 fw-bold" style="color: #f39c12;">$${parseFloat(compra.total).toFixed(2)}</h3>
              </div>
              
              <button class="btn btn-sm btn-outline-primary" onclick="verTicketHistorial(${compra.id_venta}, ${JSON.stringify(compra).replace(/"/g, '&quot;')})">
                <i class="bi bi-eye"></i> Ver Ticket
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Ver ticket desde el historial
function verTicketHistorial(id_venta, compra) {
  // Parsear la compra si viene como string
  if (typeof compra === 'string') {
    try {
      compra = JSON.parse(compra);
    } catch (e) {
      console.error('Error al parsear compra:', e);
      return;
    }
  }
  
  // Cerrar modal de historial
  bootstrap.Modal.getInstance(document.getElementById('modalHistorial')).hide();
  
  // Mostrar ticket con los datos de la compra
  setTimeout(() => {
    mostrarTicketDesdeHistorial(compra);
  }, 300);
}

// Mostrar ticket desde historial
function mostrarTicketDesdeHistorial(compra) {
  document.getElementById('ticketNumVenta').textContent = `#${compra.id_venta}`;
  
  const fecha = new Date(compra.fecha);
  const fechaFormateada = fecha.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  document.getElementById('ticketFecha').textContent = fechaFormateada;
  
  document.getElementById('ticketCliente').textContent = compra.cliente || currentUser.nombre;
  
  const productosHTML = compra.productos.map((prod, index) => `
    <div class="d-flex justify-content-between mb-2 pb-2" style="border-bottom: 1px dashed #e0e0e0;">
      <div style="flex: 1;">
        <span class="fw-semibold" style="color: #3e2723;">${index + 1}. ${prod.nombre}</span><br>
        <small style="color: #5d4037;">${prod.cantidad} x $${parseFloat(prod.precio_unitario).toFixed(2)}</small>
      </div>
      <div class="text-end">
        <span class="fw-bold" style="color: #d4af37;">$${parseFloat(prod.subtotal).toFixed(2)}</span>
      </div>
    </div>
  `).join('');
  
  document.getElementById('ticketProductos').innerHTML = productosHTML;
  document.getElementById('ticketTotal').textContent = `$${parseFloat(compra.total).toFixed(2)}`;
  document.getElementById('ticketFondosRestantes').textContent = '-';
  
  const modal = new bootstrap.Modal(document.getElementById('modalTicket'));
  modal.show();
}

// Event listener para el botón de filtrar (admin)
document.addEventListener('DOMContentLoaded', () => {
  const btnFiltrar = document.getElementById('btnFiltrarHistorial');
  if (btnFiltrar) {
    btnFiltrar.addEventListener('click', () => {
      const fechaInicio = document.getElementById('filtroFechaInicio').value;
      const fechaFin = document.getElementById('filtroFechaFin').value;
      
      const filtros = {};
      if (fechaInicio) filtros.fecha_inicio = fechaInicio;
      if (fechaFin) filtros.fecha_fin = fechaFin;
      
      cargarHistorialAdmin(filtros);
    });
  }
});