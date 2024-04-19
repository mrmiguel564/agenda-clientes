<template>
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>
            <!-- Checkbox para seleccionar todos los items -->
            <input type="checkbox" @change="toggleAllChecks" v-model="allChecked">
            <!-- Ícono de lápiz para la edición (se puede reemplazar con un ícono real) -->

          </th>
          <th >
            <div class="header-sorted">
              Nombre
            <svg width="6" height="6" viewBox="0 0 6 6" fill="none" xmlns="http://www.w3.org/2000/svg" class="sort-icon">
              <path d="M2.4345 5.31539C2.4055 5.28714 2.2815 5.18047 2.1795 5.0811C1.538 4.49854 0.488 2.97881 0.1675 2.18339C0.116 2.06259 0.007 1.75718 0 1.59401C0 1.43765 0.036 1.2886 0.109 1.14637C0.211 0.96907 0.3715 0.826839 0.561 0.748904C0.6925 0.698734 1.086 0.620799 1.093 0.620799C1.5235 0.542864 2.223 0.5 2.996 0.5C3.7325 0.5 4.4035 0.542864 4.8405 0.606673C4.8475 0.61398 5.3365 0.691914 5.504 0.777155C5.81 0.933512 6 1.23892 6 1.56576V1.59401C5.9925 1.80687 5.8025 2.25451 5.7955 2.25451C5.4745 3.00706 4.476 4.49172 3.8125 5.08841C3.8125 5.08841 3.642 5.25645 3.5355 5.32952C3.3825 5.4435 3.193 5.5 3.0035 5.5C2.792 5.5 2.595 5.43619 2.4345 5.31539Z" fill="#98A2B3"/>
            </svg><!-- Debe Guardarse en assets pero despues tengo poco tiempo -->
            </div>
            
             
          </th>
          <th >
             <div class="header-sorted" >Roles</div>
            </th>
          <th >
            <div class="header-sorted">
                          Organizaciones
              <!-- Triángulo para el ordenamiento (se puede reemplazar con un ícono real) -->
              <svg width="6" height="6" viewBox="0 0 6 6" fill="none" xmlns="http://www.w3.org/2000/svg" class="sort-icon">
              <path d="M2.4345 5.31539C2.4055 5.28714 2.2815 5.18047 2.1795 5.0811C1.538 4.49854 0.488 2.97881 0.1675 2.18339C0.116 2.06259 0.007 1.75718 0 1.59401C0 1.43765 0.036 1.2886 0.109 1.14637C0.211 0.96907 0.3715 0.826839 0.561 0.748904C0.6925 0.698734 1.086 0.620799 1.093 0.620799C1.5235 0.542864 2.223 0.5 2.996 0.5C3.7325 0.5 4.4035 0.542864 4.8405 0.606673C4.8475 0.61398 5.3365 0.691914 5.504 0.777155C5.81 0.933512 6 1.23892 6 1.56576V1.59401C5.9925 1.80687 5.8025 2.25451 5.7955 2.25451C5.4745 3.00706 4.476 4.49172 3.8125 5.08841C3.8125 5.08841 3.642 5.25645 3.5355 5.32952C3.3825 5.4435 3.193 5.5 3.0035 5.5C2.792 5.5 2.595 5.43619 2.4345 5.31539Z" fill="#98A2B3"/>
              </svg>
            </div>

 
          </th>
          <th >
            <div class="header-sorted">
                          Creación
            <!-- Triángulo para el ordenamiento (se puede reemplazar con un ícono real) -->
            <svg width="6" height="6" viewBox="0 0 6 6" fill="none" xmlns="http://www.w3.org/2000/svg" class="sort-icon">
            <path d="M2.4345 5.31539C2.4055 5.28714 2.2815 5.18047 2.1795 5.0811C1.538 4.49854 0.488 2.97881 0.1675 2.18339C0.116 2.06259 0.007 1.75718 0 1.59401C0 1.43765 0.036 1.2886 0.109 1.14637C0.211 0.96907 0.3715 0.826839 0.561 0.748904C0.6925 0.698734 1.086 0.620799 1.093 0.620799C1.5235 0.542864 2.223 0.5 2.996 0.5C3.7325 0.5 4.4035 0.542864 4.8405 0.606673C4.8475 0.61398 5.3365 0.691914 5.504 0.777155C5.81 0.933512 6 1.23892 6 1.56576V1.59401C5.9925 1.80687 5.8025 2.25451 5.7955 2.25451C5.4745 3.00706 4.476 4.49172 3.8125 5.08841C3.8125 5.08841 3.642 5.25645 3.5355 5.32952C3.3825 5.4435 3.193 5.5 3.0035 5.5C2.792 5.5 2.595 5.43619 2.4345 5.31539Z" fill="#98A2B3"/>
            </svg>
            </div>

 
          </th>
        </tr>
      </thead>
      <tbody>
        <tr class="FilaContacto" v-for="(item, index) in items" :key="index" draggable="true"
            @dragstart="dragStart(index, $event)"
            @dragover="dragOver(index, $event)"
            @dragleave="dragOverIndex = -1"
            @drop="drop(index)"
            :class="{'drag-over': dragOverIndex === index}">
          <td style="width: 40px;">
            <div class="Vertical-middle">
              <input type="checkbox" v-model="item.checked" @change="checkItemStatus">

 
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M14.4451 2.20708C14.0953 2.20708 13.6594 2.34903 13.2086 2.79981L12.2128 3.7956L14.2044 5.78717L15.2002 4.79137C15.651 4.34058 15.7929 3.90469 15.7929 3.55492C15.7929 3.1949 15.6431 2.85767 15.3927 2.60728C15.1424 2.3569 14.8051 2.20708 14.4451 2.20708ZM16.2894 5.8806C16.9939 5.17611 17.3333 4.36043 17.3333 3.55492C17.3333 2.75965 17.0018 2.03787 16.482 1.51806C15.9621 0.998248 15.2404 0.666692 14.4451 0.666687C13.6396 0.666682 12.8239 1.00609 12.1194 1.71058L10.4591 3.37086L10.4586 3.37143L10.4573 3.37264L10.4567 3.37329L10.4552 3.3748L10.454 3.37602L10.4534 3.37664L2.011 11.819C1.72667 12.1033 1.52146 12.4569 1.41566 12.8449L0.722643 15.386C0.409033 16.5359 1.46416 17.591 2.61406 17.2774L5.15514 16.5844C5.54307 16.4786 5.89668 16.2733 6.18101 15.989L14.6239 7.5461L14.625 7.54504L14.6263 7.54368L14.627 7.54298L14.7485 7.42158L16.2894 5.8806ZM13.1152 6.8764L11.1236 4.88483L3.10023 12.9082C3.00545 13.003 2.93705 13.1209 2.90178 13.2502L2.20876 15.7913L4.74983 15.0982C4.87914 15.063 4.99701 14.9946 5.09179 14.8998L6.72802 13.2636L13.1152 6.8764ZM10.7379 3.40983C10.7379 3.40983 10.7379 3.40984 10.7379 3.40983V3.40983ZM14.2044 6.8764L14.6083 7.2803C14.6083 7.28029 14.6083 7.28031 14.6083 7.2803C14.5281 7.20008 14.4022 7.07415 14.2044 6.8764Z" fill="#98A2B3"/>
              </svg>
            </div>
 
          </td>
          <td style="min-width: 200px">
            <svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M0.410749 0.910765C0.736186 0.585328 1.26382 0.585328 1.58926 0.910765L6 5.32151L10.4107 0.910765C10.7362 0.585328 11.2638 0.585328 11.5893 0.910765C11.9147 1.2362 11.9147 1.76384 11.5893 2.08928L6.58926 7.08928C6.26382 7.41471 5.73619 7.41471 5.41075 7.08928L0.410749 2.08928C0.0853125 1.76384 0.0853125 1.2362 0.410749 0.910765Z" fill="#98A2B3"/>
            </svg>

            <img :src="item.imgUrl || 'https://media.licdn.com/dms/image/C4E0BAQFY_VvRe-to1g/company-logo_200_200/0/1630655167453/unabase_software_de_gestin_logo?e=2147483647&v=beta&t=bLxZgYL4tnz1Mf1kNHBsGXTqION5UlT0YFjVkTbKEE8'" alt="Profile image" class="profile-image">
            {{ item.name.first }} {{ item.name.last }}
          </td>

          <td>
            <!-- Burbujas de roles -->
            <span v-for="role in item.roles" :key="role" class="role-bubble">{{ role.name }}</span>
          </td>
          <td>
            <!-- Logos y nombres de organizaciones, mostrando "..." si no caben -->
            <div class="org-container">
              <img v-for="org in item.organizations" :key="org.logo" :src="org.logo" class="org-logo">
              <!-- ... -->
            </div>
          </td>
          <td style="min-width: 100px">{{ timeSince(item.createdAt) }}</td> <!-- Calcular cuanto tiempo ha pasado desde esta fecha, apoyate de la fecha actual -->
        </tr>
      </tbody>
    </table>
  </div>
</template>


<script>
export default {
  name: 'DraggableTable',
  data() {
    return {
      items: [],
      allChecked: false,
      draggedIndex: null,
      dragOverIndex: -1 // Nuevo estado para seguir el índice de 'dragover'
    };
  },
  methods: {
    timeSince(dateString) {
      const now = new Date();
      const past = new Date(dateString);
      const ms = now - past;
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      const weeks = Math.floor(days / 7);
      const months = Math.floor(weeks / 4.345); // Aproximación
      const years = Math.floor(months / 12);

      if (years > 0) return `hace ${years} año${years > 1 ? 's' : ''}`;
      if (months > 0) return `hace ${months} mes${months > 1 ? 'es' : ''}`;
      if (weeks > 0) return `hace ${weeks} semana${weeks > 1 ? 's' : ''}`;
      if (days > 0) return `hace ${days} día${days > 1 ? 's' : ''}`;
      if (hours > 0) return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
      if (minutes > 0) return `hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
      return `hace ${seconds} segundo${seconds > 1 ? 's' : ''}`;
    },
    dragStart(index, event) {
      this.draggedIndex = index;
      event.dataTransfer.effectAllowed = 'move';
      var dragIcon = document.createElement('div');
      dragIcon.innerText = this.items[index].name; // Asegúrate de adaptar esta línea para que coincida con tus datos
      dragIcon.style.color = 'white';
      dragIcon.style.backgroundColor = 'rgba(0,0,0,0.65)';
      dragIcon.style.padding = '10px';
      dragIcon.style.borderRadius = '5px';
      document.body.appendChild(dragIcon);
      event.dataTransfer.setDragImage(dragIcon, 0, 0);
      setTimeout(() => document.body.removeChild(dragIcon), 0);
    },
    dragOver(index, event) {
      event.preventDefault();
      if (this.dragOverIndex !== index) {
        this.dragOverIndex = index;
      }
    },
    drop(targetIndex) {
      const itemToMove = this.items.splice(this.draggedIndex, 1)[0];
      this.items.splice(targetIndex, 0, itemToMove);
      this.dragOverIndex = -1; // Restablecer al soltar
      this.saveItems();
    },
    toggleAllChecks() {
      this.allChecked = !this.allChecked; // Cambia el estado del checkbox del encabezado
      this.items.forEach(item => {
        item.checked = this.allChecked; // Actualiza todos los items basado en el estado del checkbox del encabezado
      });
    },
    checkItemStatus() {
      this.allChecked = this.items.every(item => item.checked); // Verifica si todos los items están marcados
    },

    saveItems() {
      localStorage.setItem('tableItems', JSON.stringify(this.items));
    },
    fetchItems() {
      const items = localStorage.getItem('tableItems');
      this.items = items ? JSON.parse(items) : []; // Si no hay nada en localStorage, inicializa como arreglo vacío
    }
  },
  mounted() {
    this.fetchItems(); // Carga los datos cuando el componente se monta
  }
};
</script>

<style scoped>
.dragging {
  background-color: #40a526;
}

.header-sorted {
  min-height:100%;
  display: flex;
  justify-content: space-between; /* Esto separa los elementos hijo */
  align-items: center; /* Alinea los elementos hijo verticalmente */
  color: rgba(152, 162, 179, 1);
}

.Vertical-middle {
  display: flex;
  vertical-align: middle; /* Alineación vertical en el centro */
}

.sort-icon {
  /* Ajusta si es necesario para alinear el SVG correctamente */
  margin-left: auto; /* Esto empuja el SVG a la derecha */
}

.profile-image {
  margin-inline: 10px;
  vertical-align: middle;
  width: 32px; /* Define el ancho de la imagen */
  height: 32px; /* Define la altura de la imagen */
  border-radius: 50%; /* Hace la imagen circular */
  object-fit: cover; /* Asegura que la imagen cubra todo el espacio sin deformarse */
  border: 1px solid #E0E0E0; /* Opcional: un borde suave para la imagen */
}

.role-bubble {
  display: inline-block;
  padding: 4px 12px;
  margin: 2px;
  background: rgba(204, 245, 236, 1);
  border-radius: 15px; /* Esto crea la forma de burbuja */
  color: rgba(25, 133, 109, 1); /* Un verde oscuro para el texto, ajusta según necesites */
  font-size: 14px; /* Ajusta según el tamaño deseado */
  font-weight: bold; /* Si las burbujas deben tener texto en negrita */
  text-align: center;
  white-space: nowrap; /* Asegura que el texto no se envuelva */
  box-shadow: 0 2px 2px rgba(0, 0, 0, 0.1); /* Sombra suave para el efecto 3D */
  cursor: default;
}
.table-container td,
.table-container th {
  
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid #E0E0E0;
  vertical-align: middle; /* Alineación vertical en el centro */
}


.FilaContacto {
    align-items: center;
    color: black;
    
}

.table-container {
  /* Estilos para coincidir con el diseño proporcionado */
  box-shadow: 0px 0px 5px rgba(0, 0, 0, 0.1);
  border-radius: var(--ButtonsRadius);
  overflow: hidden; /* Para mantener el border-radius en la tabla */
}

.table-container table {
  width: 100%;
  border-collapse: collapse;
}

.table-container th, .table-container td {
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid #E0E0E0; /* Gris suave para las líneas */
}

.table-container th {
  background-color: #F5F5F5; /* Gris plomo para el encabezado */
  color: #333;
}

.table-container tr:hover {
  background-color: #F9F9F9; /* Efecto hover para las filas */
}

/* Estilos para el acordeón */
.accordion-content {
  display: none;
  background-color: #FFF; /* Fondo blanco para el contenido del acordeón */
}

.accordion-content td {
  padding: 16px;
}
.drag-over {
  border-top: 3px solid rgba(25, 133, 109, 0.5);  /* Línea sólida para indicar el espacio */
  margin-top: 10px; /* Espacio para simular que se abre un hueco */
  padding-top: 10px; /* Opcional, dependiendo de tu diseño específico */
}


/* Estilos para el botón de detalles */

</style>
