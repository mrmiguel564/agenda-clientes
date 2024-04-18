<template>
  <div class="search-box">
    <input v-model="searchTerm" @input="handleInput" placeholder="Buscar" class="search-input">
    <span class="icon">
      <i class="fa fa-search"></i>  
    </span>
  </div>
</template>

<script>
export default {
  name: 'SearchComponent',
  data() {
    return {
      searchTerm: ''
    };
  },
  methods: {
    handleInput() {
      // Emitir el término de búsqueda cada vez que el usuario escribe
      this.$emit('search-input', this.searchTerm);
    }
  }
};
</script>

<style scoped>
.search-box {
  position: relative;
  width: 100%; /* Asegura que toma el ancho del contenedor padre */
  max-width: 300px; /* Máximo ancho del componente */
}

.search-input {
  width: calc(100% - 50px); /* Resta el espacio ocupado por el icono */
  padding: 8px 40px 8px 10px; /* Asegura suficiente padding a la derecha para el ícono */
  border: 2px solid #ccc;
  border-radius: 15px;
  outline: none;
  transition: border-color 0.3s;
}

.search-input:focus {
  border-color: #333; /* Cambio de color al enfocar */
}

.icon {
  position: absolute;
  right: 10px; /* Posición del ícono dentro del input */
  top: 50%;
  transform: translateY(-50%);
  color: #ccc;
  pointer-events: none; /* El ícono no interferirá con el input */
}

.fa-search {
  font-size: 16px;
}
</style>
