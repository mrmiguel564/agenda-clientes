<template>
  <div class="hello">
    <div class="container">
      <SearchComponent @search-input="handleSearch" />
      <DeleteContactButton />
      <AddContactButton />
    </div>
  </div>
</template>

<script>
import SearchComponent from './components/SearchComponent.vue'; // Ruta relativa correcta
import AddContactButton from './components/AddContactButton.vue'; // Ruta relativa correcta
import DeleteContactButton from './components/DeleteContactButton.vue'; // Ruta relativa correcta


export default {
  name: 'MainContactos',
  components: {
    DeleteContactButton,
    SearchComponent,
    AddContactButton
  },
  props: {
    msg: String
  },
  methods: {
    handleSearch(value) {
      console.log('Search value:', value); // Aquí puedes manejar el valor de búsqueda
    }
  }
}
</script>

<style scoped>
.hello {
  margin: 20px auto;
  padding: 20px;
  max-width: 100%;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  border-radius: 10px;
  background-color: white;
  overflow: auto;
}

.container {
  display: flex;
  justify-content: space-between; /* Espaciado entre los componentes */
  align-items: center; /* Alineación vertical */
  width: 100%; /* Usa el ancho total disponible */
}

@media (max-width: 768px) {
  .hello {
    padding: 10px;
  }


}
</style>
