import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { User } from '../../core/models';

@Component({
  selector: 'app-user-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatSelectModule
  ],
  template: `
    <h2 mat-dialog-title>{{ isEdit ? 'Editar' : 'Nuevo' }} Usuario</h2>
    <mat-dialog-content>
      @if (error) { <div style="background:#ffebee;color:#c62828;padding:12px;border-radius:4px;margin-bottom:16px;">{{ error }}</div> }
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Username</mat-label>
        <input matInput [(ngModel)]="form.username" required [disabled]="isEdit">
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Nombre completo</mat-label>
        <input matInput [(ngModel)]="form.full_name" required>
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Rol</mat-label>
        <mat-select [(ngModel)]="form.role" required>
          <mat-option value="admin">Administrador</mat-option>
          <mat-option value="recepcionista">Recepcionista</mat-option>
          <mat-option value="mecanico">Mecanico</mat-option>
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>{{ isEdit ? 'Nueva contrasena (dejar vacio para no cambiar)' : 'Contrasena' }}</mat-label>
        <input matInput [(ngModel)]="form.password" type="password" [required]="!isEdit">
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="saving">
        {{ saving ? 'Guardando...' : 'Guardar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`.full-width { width: 100%; }`]
})
export class UserFormDialogComponent {
  isEdit: boolean;
  saving = false;
  error = '';
  form: any = { username: '', full_name: '', role: 'recepcionista', password: '' };

  constructor(
    private api: ApiService,
    private dialogRef: MatDialogRef<UserFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { user?: User } | null
  ) {
    this.isEdit = !!data?.user;
    if (data?.user) {
      this.form = { ...data.user, password: '' };
    }
  }

  save() {
    this.saving = true;
    this.error = '';
    const payload = { ...this.form };
    if (this.isEdit && !payload.password) delete payload.password;

    const obs = this.isEdit
      ? this.api.updateUser(this.data!.user!.id, payload)
      : this.api.createUser(payload);
    obs.subscribe({
      next: () => this.dialogRef.close(true),
      error: (err) => { this.saving = false; this.error = err.error?.error || 'Error al guardar'; }
    });
  }
}

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [
    CommonModule, MatTableModule, MatButtonModule, MatIconModule,
    MatDialogModule, MatChipsModule, MatSnackBarModule
  ],
  template: `
    <div class="page-container">
      <div class="page-header">
        <h1>Usuarios</h1>
        <button mat-raised-button color="primary" (click)="openForm()">
          <mat-icon>person_add</mat-icon> Nuevo Usuario
        </button>
      </div>

      <table mat-table [dataSource]="users" class="mat-elevation-z1">
        <ng-container matColumnDef="username">
          <th mat-header-cell *matHeaderCellDef>Username</th>
          <td mat-cell *matCellDef="let u">{{ u.username }}</td>
        </ng-container>
        <ng-container matColumnDef="full_name">
          <th mat-header-cell *matHeaderCellDef>Nombre</th>
          <td mat-cell *matCellDef="let u">{{ u.full_name }}</td>
        </ng-container>
        <ng-container matColumnDef="role">
          <th mat-header-cell *matHeaderCellDef>Rol</th>
          <td mat-cell *matCellDef="let u">
            <span [class]="'status-badge status-' + (u.role === 'admin' ? 'pagado' : u.role === 'recepcionista' ? 'abierto' : 'terminado')">
              {{ roleLabel(u.role) }}
            </span>
          </td>
        </ng-container>
        <ng-container matColumnDef="is_active">
          <th mat-header-cell *matHeaderCellDef>Estado</th>
          <td mat-cell *matCellDef="let u">
            <span [style.color]="u.is_active ? '#2e7d32' : '#c62828'">
              {{ u.is_active ? 'Activo' : 'Inactivo' }}
            </span>
          </td>
        </ng-container>
        <ng-container matColumnDef="actions">
          <th mat-header-cell *matHeaderCellDef>Acciones</th>
          <td mat-cell *matCellDef="let u">
            <button mat-icon-button (click)="openForm(u)" matTooltip="Editar">
              <mat-icon>edit</mat-icon>
            </button>
            @if (u.is_active) {
              <button mat-icon-button color="warn" (click)="deactivate(u)" matTooltip="Desactivar">
                <mat-icon>block</mat-icon>
              </button>
            }
          </td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="['username','full_name','role','is_active','actions']"></tr>
        <tr mat-row *matRowDef="let row; columns: ['username','full_name','role','is_active','actions'];"></tr>
      </table>
    </div>
  `
})
export class UserListComponent implements OnInit {
  users: User[] = [];

  constructor(
    private api: ApiService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() { this.load(); }

  load() { this.api.getUsers().subscribe(u => this.users = u); }

  roleLabel(role: string): string {
    const labels: Record<string, string> = { admin: 'Administrador', recepcionista: 'Recepcionista', mecanico: 'Mecanico' };
    return labels[role] || role;
  }

  openForm(user?: User) {
    const ref = this.dialog.open(UserFormDialogComponent, {
      width: '450px',
      data: user ? { user } : null
    });
    ref.afterClosed().subscribe(r => { if (r) this.load(); });
  }

  deactivate(user: User) {
    this.api.deleteUser(user.id).subscribe(() => {
      this.snackBar.open('Usuario desactivado', 'OK', { duration: 3000 });
      this.load();
    });
  }
}
