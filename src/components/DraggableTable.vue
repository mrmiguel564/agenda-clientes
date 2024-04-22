<template>
	<div class="table-container">
		<table>
			<thead>
				<tr>
					<th>
						<!-- Checkbox para seleccionar todos los items -->
						<input type="checkbox" @change="toggleAllChecks" :checked="allChecked">
						<!-- Ícono de lápiz para la edición (se puede reemplazar con un ícono real) -->
					</th>
					<th>
						<div class="header-sorted">
							Nombre
							<img src="@/assets/ordenby.svg" alt="Sort Icon">
						</div>
					</th>
					<th>
						<div class="header-sorted">Roles</div>
					</th>
					<th>
						<div class="header-sorted">
							Organizaciones
							<!-- Triángulo para el ordenamiento (se puede reemplazar con un ícono real) -->
							<img src="@/assets/ordenby.svg" alt="Sort Icon">
						</div>
					</th>
					<th>
						<div class="header-sorted">
							Creación
							<!-- Triángulo para el ordenamiento (se puede reemplazar con un ícono real) -->
							<img src="@/assets/ordenby.svg" alt="Sort Icon">
						</div>
					</th>
				</tr>
			</thead>
			<tbody>
				<template v-for="(item, index) in items" :key="item._id">
					<tr class="FilaContacto" draggable="true"
						@dragstart="dragStart(index, $event)" @dragover="dragOver(index, $event)"
						@dragleave="dragOverIndex = -1" @drop="drop(index)"
						:class="{ 'drag-over': dragOverIndex === index }">

						<td style="width: 40px; ">
							<div class="Vertical-middle">
								<input type="checkbox" v-model="item.checked" @change="updateHeaderCheck">

								<img src="@/assets/lapiz.svg" alt="Sort Icon">
							</div>
						</td>

						<td @click="toggleAccordion(item._id)" style="min-width: 250px" >							

							<img class="icon" style="vertical-align: middle;" :class="{ 'rotate-icon': openAccordionId == item._id }"  src="@/assets/Acordion.svg" alt="Sort Icon">

							<img :src="item.imgUrl || 'https://media.licdn.com/dms/image/C4E0BAQFY_VvRe-to1g/company-logo_200_200/0/1630655167453/unabase_software_de_gestin_logo?e=2147483647&v=beta&t=bLxZgYL4tnz1Mf1kNHBsGXTqION5UlT0YFjVkTbKEE8'"
								alt="Profile image" class="profile-image">
							<span style="text-wrap: nowrap;">{{ item.name.first }} {{ item.name.last }}</span>
						</td>

						<td @click="toggleAccordion(item._id)"> 
							<!-- Burbujas de roles -->
							<span v-for="role in item.roles" :key="role" class="role-bubble">{{ role.name }}</span>
						</td>
						<td @click="toggleAccordion(item._id)">
							<!-- Logos y nombres de organizaciones, mostrando "..." si no caben -->
							<div class="org-container">
								<img v-for="org in item.organizations" :key="org.logo" :src="org.logo" class="org-logo">
								<!-- ... -->
							</div>
						</td>
						<td @click="toggleAccordion(item._id)" style="min-width: 100px">{{ timeSince(item.createdAt) }}</td>
						<!-- Calcular cuanto tiempo ha pasado desde esta fecha, apoyate de la fecha actual -->
					</tr>

					<!-- Acordion -->
						<tr>
							<td colspan="5" style="padding: 0%;">
								<transition name="accordion" @before-enter="beforeEnter" @enter="enter" @leave="leave">
									<div v-if="openAccordionId == item._id" class="ContainerAcordion" :class="{'expanded': openAccordionId == item._id}">
										<div class="AccordionContent">
											<!-- Contenido del acordeón -->
											<div class="column">
												
												<h3 class="info-header">Correo Electrónico</h3>
												<hr />
												<div v-for="email in item.emails " :key="email" class="info-item">
													<img src="@/assets/Persona.svg" alt="Sort Icon">
													<span style="padding: 2%;">{{ email.email }}</span>
													<img @click="copyToClipboard(email)" class="icon copy-icon" src="@/assets/CopiarPegar.svg" alt="Sort Icon">
												</div>
											</div>
											<div class="column">
												<h3 class="info-header">Telefono</h3>
												<hr />

											</div>
										</div>
									</div>

								</transition>
							</td>
						</tr>
 
				</template>
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
			dragOverIndex: -1, // Nuevo estado para seguir el índice de 'dragover'
			openAccordionId: null  // Mantener el ID del acordeón activo o null si ninguno está abierto

		};
	},
	methods: {
		deleteSelectedItems() {
			this.items = this.items.filter(item => !item.checked);
			this.saveItems();
		},
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
			this.toggleAccordion(null);
			this.draggedIndex = index;
			event.dataTransfer.effectAllowed = 'move';
			const dragIcon = document.createElement('div');
			dragIcon.textContent = this.items[index].name;
			document.body.appendChild(dragIcon);
			event.dataTransfer.setDragImage(dragIcon, 0, 0);
			setTimeout(() => document.body.removeChild(dragIcon), 0);
		},
		dragOver(index, event) {
			event.preventDefault();
			this.dragOverIndex = index;
		},
		drop(targetIndex) {
			const itemToMove = this.items.splice(this.draggedIndex, 1)[0];
			this.items.splice(targetIndex, 0, itemToMove);
			this.dragOverIndex = -1;
			this.saveItems();
		},
		toggleAllChecks() {
			this.allChecked = !this.allChecked;
			this.items.forEach(item => {
				item.checked = this.allChecked; 
			});
		},
		updateHeaderCheck() {
			const allChecked = this.items.every(item => item.checked);  
			this.allChecked = allChecked; 
		},
		checkItemStatus() {
			this.allChecked = this.items.every(item => item.checked);
		},

		saveItems() {
			localStorage.setItem('tableItems', JSON.stringify(this.items));
		},
 

		fetchItems() {
			const items = localStorage.getItem('tableItems');
			if (items) {				 
				this.items = JSON.parse(items).map(item => ({
					...item,
					showDetails: Object.prototype.hasOwnProperty.call(item, 'showDetails') ? item.showDetails : false
				}));
			} else {
				// Si no hay nada en localStorage, inicializa como arreglo vacío
				this.items = [];
			}
		},


		toggleAccordion(itemId) {
			this.openAccordionId = this.openAccordionId === itemId ? null : itemId;
		},
		copyToClipboard(data) {
			navigator.clipboard.writeText(data).then(() => {
				alert('Copiado al portapapeles!'); // Puedes cambiar esto por una notificación más sutil si prefieres
			}).catch(err => {
				console.error('Error al copiar: ', err);
			});
		},
		beforeEnter(el) {
			el.style.maxHeight = '0'; // Set initial max-height to 0 for animation
 
		},
		enter(el, done) {
			el.style.transition = 'max-height 0.5s ease-in-out, opacity 0.5s ease-in-out, padding 0.5s ease-in-out, margin 0.5s ease-in-out';
			el.style.maxHeight = `${el.scrollHeight}px`; // Set max-height to the scrollHeight of the element
 
			done();
		},
		leave(el, done) {
			el.style.maxHeight = `${el.scrollHeight}px`; // Ensure max-height is set for smooth transition
			el.style.transition = 'max-height 0.5s ease-in-out, opacity 0.5s ease-in-out, padding 0.5s ease-in-out, margin 0.5s ease-in-out';
			el.style.maxHeight = '0';
			el.style.opacity = '1';
			setTimeout(done, 500); // Match the duration of the transition
		}








	},
	
	mounted() {
		this.fetchItems(); // Carga los datos cuando el componente se monta
	}
};
</script>

<style scoped>

 


.header-sorted {
	min-height: 100%;
	display: flex;
	justify-content: space-between;
	/* Esto separa los elementos hijo */
	align-items: center;
	/* Alinea los elementos hijo verticalmente */
	color: rgba(152, 162, 179, 1);
}

.Vertical-middle {
	display: flex;
	vertical-align: middle;
	/* Alineación vertical en el centro */
}

 

.profile-image {
	margin-inline: 10px;
	vertical-align: middle;
	width: 32px;
	/* Define el ancho de la imagen */
	height: 32px;
	/* Define la altura de la imagen */
	border-radius: 50%;
	/* Hace la imagen circular */
	object-fit: cover;
	/* Asegura que la imagen cubra todo el espacio sin deformarse */
	border: 1px solid #E0E0E0;
	/* Opcional: un borde suave para la imagen */
}

.role-bubble {
	display: inline-block;
	padding: 4px 12px;
	margin: 2px;
	background: rgba(204, 245, 236, 1);
	border-radius: 15px;
	/* Esto crea la forma de burbuja */
	color: rgba(25, 133, 109, 1);
	/* Un verde oscuro para el texto, ajusta según necesites */
	font-size: 14px;
	/* Ajusta según el tamaño deseado */
	font-weight: bold;
	/* Si las burbujas deben tener texto en negrita */
	text-align: center;
	white-space: nowrap;
	/* Asegura que el texto no se envuelva */
	box-shadow: 0 2px 2px rgba(0, 0, 0, 0.1);
	/* Sombra suave para el efecto 3D */
	cursor: default;
}

.table-container td,
.table-container th {

	padding: 8px;
	text-align: left;
	border-bottom: 1px solid #E0E0E0;
	vertical-align: middle;
	/* Alineación vertical en el centro */
}


.FilaContacto {
	align-items: center;
	color: black;

}

.table-container {
	/* Estilos para coincidir con el diseño proporcionado */
	box-shadow: 0px 0px 5px rgba(0, 0, 0, 0.1);
	border-radius: var(--ButtonsRadius);
	overflow: hidden;
	/* Para mantener el border-radius en la tabla */
}

.table-container table {
	width: 100%;
	border-collapse: collapse;
}

.table-container th {
	background-color: #F5F5F5;
	/* Gris plomo para el encabezado */
	color: #333;
}

.table-container tr:hover {
	background-color: #F9F9F9;
	/* Efecto hover para las filas */
}

.drag-over {
	border-top: 3px solid rgba(25, 133, 109, 0.5);
	/* Línea sólida para indicar el espacio */
	margin-top: 10px;
	/* Espacio para simular que se abre un hueco */
	padding-top: 10px;
	/* Opcional, dependiendo de tu diseño específico */
}

.rotate-icon {
	transform: rotate(180deg);
	/* Rota el SVG 180 grados */
	transition: transform 0.3s;
	/* Anima la rotación */
}

.icon {
	transition: transform 0.3s ease-in-out;
}


.ContainerAcordion {
    overflow: hidden;
    transition: max-height 0.5s ease-in-out, opacity 0.5s ease-in-out;
    max-height: 0; /* Asegura que esté colapsado inicialmente */
}

.ContainerAcordion.expanded {
    max-height: 1000px; /* Un valor alto para asegurar que se expanda completamente */
}

.AccordionContent {
	display: flex;
    padding: 20px;
    margin: 20px 40px;
    max-width: 90%;
    box-shadow: 0px 2px 40px rgba(56, 64, 76, 0.1), 0 4px 8px rgba(0, 0, 0, 0.1);
    border-radius: 10px;
    border: 1px solid rgba(152, 162, 179, 0.2);
    background-color: white;
}




.email-phone-container {
	display: flex;
	justify-content: space-around;

}

.column {
	width: 50%;
	padding-inline: 10px;
	/* Divide el espacio igualmente */
}

.info-item {
	display: flex;
	align-items: center;
	padding: 8px;
}

.info-item svg {
	margin: 0 10px;
	cursor: pointer;
}

.copy-icon {
	fill: #007BFF;
	/* Color para el icono, cambia según tu paleta */
}

/* Estilos para el ícono copiar (puedes usar tu propio SVG aquí) */
.email-phone-container {
	display: flex;
	justify-content: space-around;
	/* Espacio igual entre columnas */
}

.column {
	flex: 1;
	/* Flexibilidad en la columna para ajustar el contenido */
}

.info-header {
	font-size: 16px;
	font-weight: bold;
	margin-bottom: 5px;
	/* Espaciado después del encabezado */
}

.info-item {
	display: flex;
	align-items: center;
	margin-bottom: 5px;
	/* Espaciado entre elementos de correo */
}

.info-item span {
	flex: 1;
	/* Ocupa todo el espacio disponible */
	white-space: nowrap;
	/* Evita que el correo se envuelva */
	overflow: hidden;
	text-overflow: ellipsis;
	/* Añade elipsis si el texto es muy largo */
}

.icon {
	cursor: pointer;
	fill: #007BFF;
	/* Color del icono, ajusta según tu tema */
	margin-left: 10px;
	/* Espacio antes del icono */
	width: 24px;
	/* Tamaño del icono */
	height: 24px;
	/* Tamaño del icono */
}
 

/* Estilos para el botón de detalles */
</style>
