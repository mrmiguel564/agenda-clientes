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
  margin-right: 10px;
  position: relative;
  width: 100%; /* Asegura que toma el ancho del contenedor padre */
  max-width: 400px; /* Máximo ancho del componente */
  height: 40px;
  padding: var(--InputV-padding) var(--InputH-padding) var(--InputV-padding) var(--InputH-padding);
  gap: 0px;
  border-radius: var(--ButtonsRadius);
  border: 1px solid transparent;
  justify-content: space-between;
  opacity: 1;
  font-family: 'Nunito', sans-serif; /* Aplicar la tipografía al contenedor */
  font-size: 14px;
  font-weight: 400;
  line-height: 18px;
  text-align: left;
}

.search-input {
  height: -webkit-fill-available;
  width: calc(100% - 50px); /* Resta el espacio ocupado por el icono */
  padding: 8px 40px 8px 10px; /* Asegura suficiente padding a la derecha para el ícono */
  border: 1px solid rgba(152, 162, 179, 1);
  border-radius: 15px;
  outline: none;
  transition: border-color 0.3s;
  color: rgba(152, 162, 179, 1); /* Color de texto */
  /* Estilos de tipografía aplicados al input también */
  font-family: 'Nunito', sans-serif;
  font-size: 16px;
  font-weight: 400;
  line-height: 18px;
  text-align: left;
  
}

.search-input:focus {
  border-color: rgba(152, 162, 179, 1); /* Cambio de color al enfocar */
}

.icon {
  position: absolute;
  right: 10px; /* Posición del ícono dentro del input */
  top: 50%;
  transform: translateY(-50%);
  color: rgba(152, 162, 179, 1);
  pointer-events: none; /* El ícono no interferirá con el input */
}

.fa-search {
  font-size: 16px;
}
</style>
