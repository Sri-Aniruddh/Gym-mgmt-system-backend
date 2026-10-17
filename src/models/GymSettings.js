import mongoose from 'mongoose';

const gymSettingsSchema = new mongoose.Schema(
  {
    gymName: {
      type: String,
      default: 'IronPulse Fitness & Gym',
      trim: true
    },
    contactEmail: {
      type: String,
      default: 'contact@ironpulsefitness.com',
      trim: true
    },
    contactPhone: {
      type: String,
      default: '+1 (555) 839-2041',
      trim: true
    },
    address: {
      type: String,
      default: '742 Evergreen Fitness Way, Metropolis',
      trim: true
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true
    },
    currencySymbol: {
      type: String,
      default: '₹',
      trim: true
    },
    receiptFooter: {
      type: String,
      default: 'Thank you for choosing IronPulse Gym. Strive for greatness!',
      trim: true
    },
    logoUrl: {
      type: String,
      default: ''
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

// Helper to retrieve the current settings or create the default one
gymSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

const GymSettings = mongoose.model('GymSettings', gymSettingsSchema);
export default GymSettings;
