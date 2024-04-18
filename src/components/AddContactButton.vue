<template>
    <button class="contact-button">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fill-rule="evenodd" clip-rule="evenodd" d="M10 2C8.06701 2 6.5 3.567 6.5 5.5C6.5 7.433 8.06701 9 10 9C11.933 9 13.5 7.433 13.5 5.5C13.5 3.567 11.933 2 10 2ZM4.5 5.5C4.5 2.46243 6.96244 0 10 0C13.0376 0 15.5 2.46243 15.5 5.5C15.5 8.53757 13.0376 11 10 11C6.96244 11 4.5 8.53757 4.5 5.5ZM10 15C6.8088 15 3.89333 16.389 1.7276 18.686C1.34873 19.0878 0.715842 19.1065 0.314 18.7276C-0.0878419 18.3487 -0.106465 17.7158 0.272404 17.314C2.77826 14.6562 6.20523 13 10 13C10.5523 13 11 13.4477 11 14C11 14.5523 10.5523 15 10 15Z" fill="#F3F4F6"/>
        <path fill-rule="evenodd" clip-rule="evenodd" d="M16 12C16.5523 12 17 12.4477 17 13V15H19C19.5523 15 20 15.4477 20 16C20 16.5523 19.5523 17 19 17H17V19C17 19.5523 16.5523 20 16 20C15.4477 20 15 19.5523 15 19V17H13C12.4477 17 12 16.5523 12 16C12 15.4477 12.4477 15 13 15H15V13C15 12.4477 15.4477 12 16 12Z" fill="#F3F4F6"/>
        </svg>
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
 
        this.buttonText = 'Agregar Contacto'; // Texto completo para pantallas anchas
 
      }
    }
  };
  </script>
  
  <style scoped>
  .contact-button {
  
    


    margin-inline: 2px;
    background-color: rgba(32, 167, 137, 1); /* Color verde */
    color: white;
    border: none;
    padding: 5px 15px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    cursor: pointer;
    outline: none;
    transition: background-color 0.3s;

    width: Hug (202px)px;
    height: Hug (36px)px;
    padding: var(--ButtonsV-padding) var(--ButtonsH-padding) var(--ButtonsV-padding) var(--ButtonsH-padding);
    gap: var(--ButtonsSpacing);
    border-radius: var(--ButtonsRadius);
    opacity: 0px;
  }

  
  .contact-button:hover {
    background-color: rgba(12, 147, 117, 1); /* Un verde un poco más oscuro al pasar el mouse */
  }
  

  
  .button-text {
    font-family: 'Nunito', sans-serif; 
    text-align: left;
    white-space: nowrap; /* Evita que el texto se parta en líneas */
  }
  </style>
  