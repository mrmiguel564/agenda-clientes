<template>
    <button class="contact-button">
      <i class="fa fa-user-plus"></i>
      <span class="button-text">{{ buttonText }}</span>
    </button>
  </template>
  
  <script>
  export default {
    name: 'AddContactButton',
    data() {
      return {
        buttonText: 'Agregar Contacto' // Texto completo del botón
      };
    },
    mounted() {
      this.handleResize(); // Llamada inicial para ajustar el texto
      window.addEventListener('resize', this.handleResize); // Escuchar cambios de tamaño
    },
    beforeUnmount() {
      window.removeEventListener('resize', this.handleResize); // Limpiar el listener
    },
    methods: {
      handleResize() {
        if (window.innerWidth < 768) {
          this.buttonText = 'Agregar'; // Texto corto para pantallas estrechas
        } else {
          this.buttonText = 'Agregar Contacto'; // Texto completo para pantallas anchas
        }
      }
    }
  };
  </script>
  
  <style scoped>
  .contact-button {
    margin-inline: 2px;
    background-color: #4CAF50; /* Color verde */
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    cursor: pointer;
    outline: none;
    transition: background-color 0.3s;
  }
  
  .contact-button:hover {
    background-color: #45a049; /* Un verde un poco más oscuro al pasar el mouse */
  }
  
  .fa-user-plus {
    margin-right: 10px; /* Espacio entre el ícono y el texto */
  }
  
  .button-text {
    white-space: nowrap; /* Evita que el texto se parta en líneas */
  }
  </style>
  