// mapa.js - Configuración del mapa con Leaflet y Socket.IO

let map;
let socket;
let userMarkers = {}; // Para guardar los marcadores de otros usuarios
let myMarker; // Mi marcador

// Esperar a que el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  console.log('🗺️ Mapa.js cargado correctamente');
  
  // Inicializar el mapa cuando se abre el modal
  const btnConocenos = document.getElementById('btnConocenos');
  if (btnConocenos) {
    btnConocenos.addEventListener('click', () => {
      console.log('🔵 Modal Conócenos abierto');
      // Esperar un momento para que el modal se renderice
      setTimeout(() => {
        initMap();
      }, 500);
    });
  } else {
    console.error('❌ No se encontró el botón #btnConocenos');
  }
});

function initMap() {
  console.log('🚀 Intentando inicializar mapa...');
  
  // Verificar si el contenedor existe
  const mapContainer = document.getElementById('map-template');
  if (!mapContainer) {
    console.error('❌ No se encontró el div #map-template en el DOM');
    return;
  }
  
  // Si el mapa ya existe, solo actualizar tamaño
  if (map) {
    console.log('📐 Mapa ya existe, actualizando tamaño...');
    setTimeout(() => {
      map.invalidateSize();
    }, 100);
    return;
  }

  console.log('🌍 Creando nuevo mapa...');

  // Coordenadas de la Ciudad de México (Pastelería Ideal como ejemplo)
  const mexicoCityCoords = [19.4270202, -99.1617437];
  
  // Crear el mapa centrado en CDMX con zoom
  map = L.map('map-template').setView(mexicoCityCoords, 13);
  
  console.log('✅ Mapa creado exitosamente');

  // Agregar capa de tiles (el diseño del mapa)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  console.log('🗺️ Tiles agregados al mapa');

  // Icono personalizado para la panadería
  const panaderiaIcon = L.divIcon({
    className: 'custom-panaderia-icon',
    html: '<div style="font-size: 2.5rem;">🍞</div>',
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40]
  });

  // Marcador de la panadería
  const panaderiaMarker = L.marker(mexicoCityCoords, { icon: panaderiaIcon });
  panaderiaMarker.bindPopup(`
    <div style="text-align: center;">
      <strong style="color: #d4af37; font-size: 1.1rem;">🍞 Panadería La Desesperanza</strong><br>
      <small>Av. 16 de Septiembre 18, Centro Histórico</small><br>
      <small>📞 (55) 1234-5678</small>
    </div>
  `);
  map.addLayer(panaderiaMarker);

  console.log('🍞 Marcador de panadería agregado');

  // Conectar a Socket.IO
  socket = io();
  
  socket.on('connect', () => {
    console.log('✅ Socket.IO conectado:', socket.id);
  });

  // Intentar obtener la ubicación del usuario
  map.locate({ enableHighAccuracy: true });

  // Cuando se encuentra la ubicación
  map.on('locationfound', (e) => {
    console.log('📍 Ubicación encontrada:', e.latlng);
    const coords = e.latlng;
    
    // Icono para mi ubicación
    const myIcon = L.divIcon({
      className: 'custom-user-icon',
      html: '<div style="background-color: #28a745; border: 3px solid white; border-radius: 50%; width: 20px; height: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    // Crear mi marcador
    myMarker = L.marker(coords, { icon: myIcon });
    myMarker.bindPopup('¡Aquí estoy yo! 👋');
    map.addLayer(myMarker);

    console.log('🟢 Mi marcador agregado al mapa');

    // Enviar mis coordenadas al servidor
    socket.emit('userCoordinates', {
      lat: coords.lat,
      lng: coords.lng
    });

    console.log('📤 Coordenadas enviadas al servidor');

    // Agregar un círculo de precisión
    L.circle(coords, {
      radius: e.accuracy / 2,
      color: '#28a745',
      fillColor: '#28a745',
      fillOpacity: 0.1
    }).addTo(map);
  });

  // Si hay error al obtener ubicación
  map.on('locationerror', (e) => {
    console.log('⚠️ No se pudo obtener la ubicación:', e.message);
  });

  // Escuchar cuando otros usuarios se conectan
  socket.on('userNewCoordinates', (data) => {
    console.log('👤 Nuevo usuario conectado:', data);
    
    const { coords, socketId } = data;
    
    // Icono para otros usuarios
    const otherIcon = L.divIcon({
      className: 'custom-other-icon',
      html: '<div style="background-color: #d4af37; border: 3px solid white; border-radius: 50%; width: 20px; height: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    // Crear marcador del otro usuario
    const marker = L.marker([coords.lat, coords.lng], { icon: otherIcon });
    marker.bindPopup('👤 Otro cliente conectado');
    map.addLayer(marker);

    // Guardar referencia al marcador
    userMarkers[socketId] = marker;
    
    console.log('🟡 Marcador de otro usuario agregado');
  });

  // Cuando un usuario se desconecta
  socket.on('userDisconnected', (socketId) => {
    console.log('👋 Usuario desconectado:', socketId);
    
    // Eliminar su marcador del mapa
    if (userMarkers[socketId]) {
      map.removeLayer(userMarkers[socketId]);
      delete userMarkers[socketId];
      console.log('🗑️ Marcador eliminado del mapa');
    }
  });
  
  // Ajustar tamaño del mapa después de renderizar
  setTimeout(() => {
    map.invalidateSize();
    console.log('📐 Tamaño del mapa ajustado');
  }, 200);
}

// Limpiar cuando se cierra el modal
const modalConocenos = document.getElementById('modalConocenos');
if (modalConocenos) {
  modalConocenos.addEventListener('hidden.bs.modal', () => {
    console.log('❌ Modal cerrado');
    if (socket) {
      socket.disconnect();
      console.log('🔌 Socket desconectado');
    }
  });
}