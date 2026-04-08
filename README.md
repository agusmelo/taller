# Sistema de Gestion de Taller Mecanico

## Inicio rapido

### Prerequisitos
- Docker Desktop instalado y corriendo

### Levantar todo
```bash
docker compose up --build
```

API disponible en: http://localhost:3000
Frontend disponible en: http://localhost:4200

### Credenciales por defecto
| Usuario | Contrasena | Rol |
|---------|------------|-----|
| admin | admin123 | Administrador |
| recepcionista1 | recep123 | Recepcionista |
| mecanico1 | mec123 | Mecanico |

### Comandos utiles
```bash
# Levantar todo en background
docker compose up -d

# Ver logs de la API
docker compose logs -f api

# Resetear base de datos completamente
docker compose down -v && docker compose up --build

# Conectar a la base de datos
docker exec -it workshop-db psql -U workshop -d workshop_db

# Frontend en desarrollo
cd workshop-frontend && ng serve
```
