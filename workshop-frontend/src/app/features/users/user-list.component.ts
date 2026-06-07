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
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';
import { User } from '../../core/models';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { FormDialogComponent } from '../../shared/components/form-dialog/form-dialog.component';
import { extractApiError } from '../../shared/utils/api-error';

@Component({
  selector: 'app-user-form-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatSelectModule, FormDialogComponent,
  ],
  template: `
    <app-form-dialog
      [title]="isEdit ? 'Editar usuario' : 'Nuevo usuario'"
      [subtitle]="isEdit ? form.username : 'Crear cuenta de acceso al sistema'"
      [error]="error"
      [saving]="saving"
      [canSave]="canSave()"
      (save)="save()"
      (cancel)="dialogRef.close(false)">

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Username <span class="req">*</span></mat-label>
        <input matInput [(ngModel)]="form.username" required [disabled]="isEdit" autofocus>
        <mat-hint>Mínimo 3 caracteres · no se puede cambiar después</mat-hint>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Nombre completo <span class="req">*</span></mat-label>
        <input matInput [(ngModel)]="form.full_name" required>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Rol <span class="req">*</span></mat-label>
        <mat-select [(ngModel)]="form.role" required>
          <mat-option value="admin">Administrador</mat-option>
          <mat-option value="recepcionista">Recepcionista</mat-option>
          <mat-option value="mecanico">Mecánico</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>
          {{ isEdit ? 'Nueva contraseña' : 'Contraseña' }}
          @if (!isEdit) { <span class="req">*</span> }
        </mat-label>
        <input matInput [(ngModel)]="form.password" type="password" [required]="!isEdit">
        <mat-hint>
          @if (isEdit) {
            Dejar vacío para mantener la actual
          } @else {
            Mínimo 6 caracteres
          }
        </mat-hint>
      </mat-form-field>
    </app-form-dialog>
  `,
  styles: [`.full-width { width: 100%; margin-bottom: 4px; }`]
})
export class UserFormDialogComponent {
  isEdit: boolean;
  saving = false;
  error: string | null = null;
  form: any = { username: '', full_name: '', role: 'recepcionista', password: '' };

  constructor(
    private api: ApiService,
    public  dialogRef: MatDialogRef<UserFormDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { user?: User } | null
  ) {
    this.isEdit = !!data?.user;
    if (data?.user) {
      this.form = { ...data.user, password: '' };
    }
  }

  canSave(): boolean {
    return !!this.form.full_name && (this.isEdit || !!this.form.password);
  }

  save() {
    this.saving = true;
    this.error = null;
    const payload = { ...this.form };
    if (this.isEdit && !payload.password) delete payload.password;

    const obs = this.isEdit
      ? this.api.updateUser(this.data!.user!.id, payload)
      : this.api.createUser(payload);
    obs.subscribe({
      next: () => this.dialogRef.close(true),
      error: (err) => {
        this.saving = false;
        this.error = extractApiError(err);
      }
    });
  }
}

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [
    CommonModule, MatTableModule, MatButtonModule, MatIconModule,
    MatDialogModule, MatProgressSpinnerModule, MatCardModule, MatTooltipModule
  ],
  template: `
    <main class="content">
      <div class="page-head">
        <h1>Usuarios</h1>
        <button mat-raised-button color="primary" (click)="openForm()">
          <mat-icon>person_add</mat-icon> Nuevo Usuario
        </button>
      </div>

      @if (loading) {
        <div class="loading-overlay"><mat-spinner diameter="40"></mat-spinner></div>
      } @else {
        <mat-card class="table-card">
          <mat-card-content>
            <table mat-table [dataSource]="users">
              <ng-container matColumnDef="username">
                <th mat-header-cell *matHeaderCellDef>Username</th>
                <td mat-cell *matCellDef="let u" class="t-mono">{{ u.username }}</td>
              </ng-container>
              <ng-container matColumnDef="full_name">
                <th mat-header-cell *matHeaderCellDef>Nombre</th>
                <td mat-cell *matCellDef="let u">{{ u.full_name }}</td>
              </ng-container>
              <ng-container matColumnDef="role">
                <th mat-header-cell *matHeaderCellDef>Rol</th>
                <td mat-cell *matCellDef="let u">
                  <span [class]="'badge ' + roleBadgeClass(u.role)">
                    {{ roleLabel(u.role) }}
                  </span>
                </td>
              </ng-container>
              <ng-container matColumnDef="is_active">
                <th mat-header-cell *matHeaderCellDef>Estado</th>
                <td mat-cell *matCellDef="let u">
                  <span [class]="u.is_active ? 'badge b-pagado' : 'badge b-reg'">
                    {{ u.is_active ? 'Activo' : 'Inactivo' }}
                  </span>
                </td>
              </ng-container>
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef class="text-right">Acciones</th>
                <td mat-cell *matCellDef="let u" class="text-right">
                  <button mat-icon-button (click)="openForm(u)" matTooltip="Editar">
                    <mat-icon>edit</mat-icon>
                  </button>
                  @if (u.is_active) {
                    <button mat-icon-button color="warn" (click)="confirmDeactivate(u)" matTooltip="Desactivar">
                      <mat-icon>block</mat-icon>
                    </button>
                  }
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="['username','full_name','role','is_active','actions']"></tr>
              <tr mat-row *matRowDef="let row; columns: ['username','full_name','role','is_active','actions'];"></tr>
            </table>
          </mat-card-content>
        </mat-card>
      }
    </main>
  `,
  styles: [``]
})
export class UserListComponent implements OnInit {
  users: User[] = [];
  loading = false;

  constructor(
    private api: ApiService,
    private dialog: MatDialog,
    private notify: NotificationService
  ) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.api.getUsers().subscribe({
      next: u => { this.users = u; this.loading = false; },
      error: err => { this.notify.handleError(err); this.loading = false; }
    });
  }

  roleLabel(role: string): string {
    const labels: Record<string, string> = { admin: 'Administrador', recepcionista: 'Recepcionista', mecanico: 'Mecanico' };
    return labels[role] || role;
  }

  roleBadgeClass(role: string): string {
    const classes: Record<string, string> = {
      admin: 'b-vip',
      recepcionista: 'b-pro',
      mecanico: 'b-teal'
    };
    return classes[role] || 'b-reg';
  }

  openForm(user?: User) {
    const ref = this.dialog.open(UserFormDialogComponent, {
      width: '450px',
      data: user ? { user } : null
    });
    ref.afterClosed().subscribe(r => {
      if (r) {
        this.notify.success(user ? 'Usuario actualizado' : 'Usuario creado');
        this.load();
      }
    });
  }

  confirmDeactivate(user: User) {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '380px',
      data: {
        title: 'Desactivar usuario',
        message: `¿Esta seguro de desactivar al usuario "${user.username}"?`,
        confirmText: 'Desactivar'
      }
    });
    ref.afterClosed().subscribe(confirmed => {
      if (confirmed) this.deactivate(user);
    });
  }

  deactivate(user: User) {
    this.api.deleteUser(user.id).subscribe({
      next: () => { this.notify.success('Usuario desactivado'); this.load(); },
      error: err => this.notify.handleError(err)
    });
  }
}
