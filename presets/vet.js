// Preset del rubro veterinaria. Todo lo que cambia entre rubros vive aquí.
// Los íconos son nombres de Tabler Icons (https://tabler.io/icons).

export default {
  id: 'vet',

  negocio: {
    nombre: 'Huellitas Vet',
    razon_social: 'Huellitas Vet SpA',
    slogan: 'Clínica veterinaria',
    direccion: 'Av. Providencia 1234, Providencia, Santiago',
    mapa_url: 'https://www.google.com/maps/search/?api=1&query=Av.+Providencia+1234+Santiago',
    telefono: '+56 9 1234 5678',
    whatsapp: '56912345678',
    email_contacto: 'miguel.espinoza.dev@gmail.com',
  },

  hero: {
    titulo: 'Cuidamos a tu mascota como familia',
    subtitulo: 'Agenda su hora en un minuto, sin llamadas ni esperas.',
    cta: 'Agenda la hora de tu mascota',
    chips: ['Urgencias', 'Telemedicina', 'A domicilio'],
  },

  // Se cargan a la BD la primera vez; luego se editan en el admin.
  servicios: [
    { nombre: 'Consulta general', descripcion: 'Revisión completa y diagnóstico.', icono: 'stethoscope', duracion_min: 30, buffer_min: 0 },
    { nombre: 'Urgencias', descripcion: 'Atención prioritaria el mismo día.', icono: 'ambulance', duracion_min: 30, buffer_min: 0, es_urgencia: true },
    { nombre: 'Vacunación', descripcion: 'Calendario de vacunas al día.', icono: 'vaccine', duracion_min: 30, buffer_min: 0 },
    { nombre: 'Desparasitación', descripcion: 'Interna y externa, con control.', icono: 'bug-off', duracion_min: 30, buffer_min: 0 },
    { nombre: 'Control sano', descripcion: 'Chequeo preventivo anual.', icono: 'heart-rate-monitor', duracion_min: 30, buffer_min: 0 },
    { nombre: 'Telemedicina', descripcion: 'Orientación por videollamada.', icono: 'video', duracion_min: 30, buffer_min: 0 },
    { nombre: 'Ecografía y rayos', descripcion: 'Imagenología y escaneos.', icono: 'scan', duracion_min: 60, buffer_min: 0 },
    { nombre: 'Exámenes de laboratorio', descripcion: 'Toma de muestras y resultados.', icono: 'flask', duracion_min: 30, buffer_min: 0 },
    { nombre: 'Peluquería y baño', descripcion: 'Baño, corte y uñas.', icono: 'scissors', duracion_min: 60, buffer_min: 0 },
    { nombre: 'Atención a domicilio', descripcion: 'Vamos a tu casa (comunas cercanas).', icono: 'home-heart', duracion_min: 60, buffer_min: 30 },
    { nombre: 'Microchip', descripcion: 'Implante y registro nacional.', icono: 'cpu', duracion_min: 30, buffer_min: 0 },
    { nombre: 'Certificado de viaje', descripcion: 'Documentación para viajar.', icono: 'plane', duracion_min: 30, buffer_min: 0 },
    { nombre: 'Evaluación prequirúrgica', descripcion: 'Exámenes y evaluación antes de cirugía.', icono: 'clipboard-heart', duracion_min: 60, buffer_min: 0 },
  ],

  especies: [
    { id: 'perro', label: 'Perro', icono: 'dog' },
    { id: 'gato', label: 'Gato', icono: 'cat' },
    { id: 'exotico', label: 'Exótico', icono: 'feather' },
    { id: 'otro', label: 'Otro', icono: 'paw' },
  ],

  // Modales "Nos adaptamos a tu mascota"
  modales: [
    {
      id: 'perros-gatos',
      titulo: 'Perros y gatos',
      icono: 'dog',
      texto: 'Atención para todas las etapas: cachorros, adultos y seniors. Manejo amable y libre de miedo.',
      puntos: ['Plan de vacunas', 'Control sano anual', 'Peluquería y baño', 'Esterilización (evaluación)'],
      servicio: 'Consulta general',
    },
    {
      id: 'exoticos',
      titulo: 'Exóticos',
      icono: 'feather',
      texto: 'Conejos, aves, hurones, cuyes y otros roedores. Manejo especial y sin estrés.',
      puntos: ['Control sano', 'Asesoría de dieta', 'Corte de uñas y pico', 'Diagnóstico por imagen'],
      servicio: 'Consulta general',
    },
    {
      id: 'urgencias',
      titulo: 'Urgencias',
      icono: 'alert-triangle',
      texto: 'Si tu mascota tiene dificultad para respirar, sangrado, convulsiones, ingirió algo tóxico o fue atropellada, llámanos de inmediato y ven a la clínica.',
      puntos: ['Llámanos antes de venir', 'Mantén a tu mascota abrigada y quieta', 'Trae el envase si ingirió algo'],
      servicio: 'Urgencias',
    },
  ],

  pasos: [
    { icono: 'calendar-event', titulo: 'Elige la hora', texto: 'Servicio, día y hora en una sola pantalla.' },
    { icono: 'id', titulo: 'Ingresa tu RUT', texto: 'Si ya viniste, recuperamos a tus mascotas.' },
    { icono: 'mail-check', titulo: 'Listo', texto: 'Te llega la confirmación al correo.' },
  ],

  faq: [
    { q: '¿Puedo cancelar mi hora?', a: 'Sí. En el correo de confirmación tienes un link para cancelar, o desde "Mis horas" en este mismo dispositivo.' },
    { q: '¿Qué pasa si es una urgencia?', a: 'Llámanos o escríbenos por WhatsApp antes de venir. Si hay cupo hoy, también puedes agendar el servicio de Urgencias.' },
    { q: '¿Atienden exóticos?', a: 'Sí: conejos, aves, hurones y roedores. Indícalo al registrar a tu mascota.' },
    { q: '¿Por qué piden mi RUT?', a: 'Para asociar cada hora a un tutor real, evitar reservas falsas y llevar el registro de visitas de tu mascota.' },
    { q: '¿Cómo pago?', a: 'El pago se realiza en la clínica al momento de la atención.' },
  ],

  // Horario por defecto inicial (0 = domingo). Se edita en el admin.
  horario_default: [
    { weekday: 1, ranges: [['08:00', '13:00'], ['14:00', '18:00']] },
    { weekday: 2, ranges: [['08:00', '13:00'], ['14:00', '18:00']] },
    { weekday: 3, ranges: [['08:00', '13:00'], ['14:00', '18:00']] },
    { weekday: 4, ranges: [['08:00', '13:00'], ['14:00', '18:00']] },
    { weekday: 5, ranges: [['08:00', '13:00'], ['14:00', '18:00']] },
    { weekday: 6, ranges: [['09:00', '13:00']] },
  ],
};
