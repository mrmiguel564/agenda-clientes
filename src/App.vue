<template>
  <div class="hello">
    <div class="container">
      <SearchComponent :search-input="searchText" @search-input="handleSearch" />
 
      <div class="button-group">
        <DeleteContactButton @delete-selected-items="handleDeleteFromTable" />
        <AddContactButton />
      </div>
    </div>  
    <!-- Listado -->
    <DraggableTable :items="items" :search-term="searchText" ref="draggableTable" />
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
  data() {
    return {
      items: [],
      searchText: ''
    };
  },
  methods: {
    handleSearch(newSearchText) {
      this.searchText = newSearchText;
 
    },
    handleDeleteFromTable() {
      this.$refs.draggableTable.deleteSelectedItems();
    },
    async fetchItems() {
      try {
        const response = await fetch('https://ubapp.unabase.cc/app/users/search/random');
        if (!response.ok) {
          throw new Error('Network response was not ok: ' + response.statusText);
        }
        this.items = await response.json();
        localStorage.setItem('tableItems', JSON.stringify(this.items)); // Guarda en localStorage
        console.log('Data received:', this.items);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    },
    saveItems() {
      localStorage.setItem('tableItems', JSON.stringify(this.items));
    },
    handleReorder(newOrder) {
      this.items = newOrder;
      this.saveItems();
    }
  },
  mounted() {
    const storedItems = localStorage.getItem('tableItems');
    if (  JSON.parse(storedItems).length === 0) {   
      this.fetchItems();
    } else {
      this.items = JSON.parse(storedItems);
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
  min-height: calc(100vh - 80px); /* Cambiar a variables */
  
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
