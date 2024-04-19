<template>
  <div class="hello">
    <div class="container">
      <SearchComponent @search-input="handleSearch" />
      <div class="button-group">
        <DeleteContactButton />
        <AddContactButton />
      </div>
    </div>  
    <!-- Listado -->
    <DraggableTable />
  </div>
</template>

<script>


import DraggableTable from './components/DraggableTable.vue';
import SearchComponent from './components/SearchComponent.vue';
import AddContactButton from './components/AddContactButton.vue';
import DeleteContactButton from './components/DeleteContactButton.vue';

export default {
  name: 'App',
  components: {
    DraggableTable,
    SearchComponent,
    AddContactButton,
    DeleteContactButton
  },
  props: {
    msg: String
  },
  methods: {
    handleSearch(value) {
      console.log('Search value:', value); // Manejo del valor de búsqueda
    }
  }
}
</script>

<style scoped>
/* assets/main.css */

@import './assets/variables.css';
/* Resto del CSS global */

.hello {
  margin: 20px auto;
  padding: 20px;
  max-width: 100%;
  box-shadow: 0px 2px 4px 0px rgba(56, 64, 76, 0.04);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  border-radius: 10px;
  background-color: white;
  overflow: auto;
}

.container {
  display: flex;
  justify-content: space-between; /* Espaciado entre los componentes principales */
  align-items: center;
  width: 100%;
  margin-bottom: 10px;
}

.button-group {
  display: flex;
  gap: 10px; /* Espacio entre los botones */
}


</style>
