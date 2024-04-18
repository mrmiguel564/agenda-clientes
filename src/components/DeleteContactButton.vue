<template>
  <button class="trash-button" @click="handleClick">
    <i class="fa fa-trash"></i>
  </button>
</template>

<script>
export default {
  name: 'TrashButton',
  methods: {
    handleClick() {
      this.$emit('clicked'); // Emitir un evento cuando el botón es presionado
    }
  }
};
</script>

<style scoped>
.trash-button {
  background-color: white; /* Fondo blanco */
  border: 2px solid #ccc; /* Borde gris claro */
  border-radius: 15px; /* Bordes redondeados */
  padding: 8px 16px; /* Padding adecuado para el ícono */
  cursor: pointer; /* Cursor de mano para indicar clickeabilidad */
  outline: none; /* Eliminar el borde de foco predeterminado */
  transition: background-color 0.3s, border-color 0.3s; /* Transición suave para hover */
}

.trash-button:hover {
  background-color: #f8f8f8; /* Cambiar ligeramente el color de fondo al pasar el ratón */
  border-color: #bbb; /* Oscurecer el borde al pasar el ratón */
}

.fa-trash {
  color: #333; /* Color del ícono del tarro de basura */
}
</style>
