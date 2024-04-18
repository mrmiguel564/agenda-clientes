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
          <th>
            Nombre
            <!-- Triángulo para el ordenamiento (se puede reemplazar con un ícono real) -->
            <span  >▲</span>
          </th>
          <th>Roles</th>
          <th>
            Organizaciones
            <!-- Triángulo para el ordenamiento (se puede reemplazar con un ícono real) -->
            <span  >▲</span>
          </th>
          <th>
            Creación
            <!-- Triángulo para el ordenamiento (se puede reemplazar con un ícono real) -->
            <span  >▲</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr class="FilaContacto" v-for="(item, index) in items" :key="index">
          <td>
            <input type="checkbox" v-model="item.checked">
            <span @click="editItem(item)"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M14.4451 2.20708C14.0953 2.20708 13.6594 2.34903 13.2086 2.79981L12.2128 3.7956L14.2044 5.78717L15.2002 4.79137C15.651 4.34058 15.7929 3.90469 15.7929 3.55492C15.7929 3.1949 15.6431 2.85767 15.3927 2.60728C15.1424 2.3569 14.8051 2.20708 14.4451 2.20708ZM16.2894 5.8806C16.9939 5.17611 17.3333 4.36043 17.3333 3.55492C17.3333 2.75965 17.0018 2.03787 16.482 1.51806C15.9621 0.998248 15.2404 0.666692 14.4451 0.666687C13.6396 0.666682 12.8239 1.00609 12.1194 1.71058L10.4591 3.37086L10.4586 3.37143L10.4573 3.37264L10.4567 3.37329L10.4552 3.3748L10.454 3.37602L10.4534 3.37664L2.011 11.819C1.72667 12.1033 1.52146 12.4569 1.41566 12.8449L0.722643 15.386C0.409033 16.5359 1.46416 17.591 2.61406 17.2774L5.15514 16.5844C5.54307 16.4786 5.89668 16.2733 6.18101 15.989L14.6239 7.5461L14.625 7.54504L14.6263 7.54368L14.627 7.54298L14.7485 7.42158L16.2894 5.8806ZM13.1152 6.8764L11.1236 4.88483L3.10023 12.9082C3.00545 13.003 2.93705 13.1209 2.90178 13.2502L2.20876 15.7913L4.74983 15.0982C4.87914 15.063 4.99701 14.9946 5.09179 14.8998L6.72802 13.2636L13.1152 6.8764ZM10.7379 3.40983C10.7379 3.40983 10.7379 3.40984 10.7379 3.40983V3.40983ZM14.2044 6.8764L14.6083 7.2803C14.6083 7.28029 14.6083 7.28031 14.6083 7.2803C14.5281 7.20008 14.4022 7.07415 14.2044 6.8764Z" fill="#98A2B3"/>
            </svg>
    </span>
          </td>
          <td>
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
          <td>{{ timeSince(item.createdAt) }}</td> <!-- Calcular cuanto tiempo ha pasado desde esta fecha, apoyate de la fecha actual -->
        </tr>
      </tbody>
    </table>
  </div>
</template>


<script>

import jsonData from '@/assets/Contactos.json';


export default {
  name: 'DraggableTable',
  data() {
    return {
      items: jsonData, // Aquí asignas tus datos JSON directamente a 'items'
      allChecked: false,
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
    }
  }


};
</script>

<style scoped>
.profile-image {
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

/* Estilos para el botón de detalles */
.table-container button {
  /* Añade aquí los estilos para tu botón, como colores, bordes, etc. */
}
</style>
