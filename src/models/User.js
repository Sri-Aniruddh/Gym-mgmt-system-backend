import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false // Never return in standard queries
    },
    role: {
      type: String,
      enum: ['ADMIN', 'MEMBER'],
      default: 'MEMBER',
      index: true
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE'
    },
    mustChangePassword: {
      type: Boolean,
      default: false
    },
    memberId: {
      type: String,
      trim: true,
      sparse: true,
      index: true
    },
    // Security credentials for invitations and password resets
    invitationTokenHash: {
      type: String,
      select: false
    },
    oneTimeCredentialHash: {
      type: String,
      select: false
    },
    invitationExpiresAt: {
      type: Date,
      select: false
    },
    resetPasswordTokenHash: {
      type: String,
      select: false
    },
    resetPasswordExpiresAt: {
      type: Date,
      select: false
    },
    refreshTokenHash: {
      type: String,
      select: false
    }
  },
  {
    timestamps: true
  }
);

// Method to verify password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Static helper to hash passwords
userSchema.statics.hashPassword = async function (plainPassword) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainPassword, salt);
};

const User = mongoose.model('User', userSchema);
export default User;
