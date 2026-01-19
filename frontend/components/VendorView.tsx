'use client';

import { useState } from 'react';
import { Plus, Mail, Phone, MapPin, X } from 'lucide-react';
import axios from 'axios';
import { apiUrl } from '../lib/api';

interface VendorViewProps {
  vendors: any[];
  onRefresh: () => void;
}

export default function VendorView({ vendors, onRefresh }: VendorViewProps) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    contactName: '',
    phone: '',
    address: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(apiUrl('/api/vendors'), formData);
      setShowForm(false);
      setFormData({
        name: '',
        email: '',
        contactName: '',
        phone: '',
        address: '',
        notes: '',
      });
      onRefresh();
    } catch (error: any) {
      alert(`Error: ${error.response?.data?.error || error.message}`);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 border-b border-gray-200 bg-white flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Add Vendor
        </button>
      </div>

      {/* Add Vendor Modal */}
      {showForm && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity"
            onClick={() => setShowForm(false)}
          />
          
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div 
              className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Add New Vendor</h2>
                  <p className="text-sm text-gray-500 mt-1">Enter vendor information below</p>
                </div>
                <button
                  onClick={() => setShowForm(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={24} className="text-gray-600" />
                </button>
              </div>
              
              {/* Modal Content */}
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="vendor-name" className="block text-sm font-medium mb-1 text-gray-700">Name *</label>
                        <input
                          id="vendor-name"
                          name="name"
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                        />
                      </div>
                      <div>
                        <label htmlFor="vendor-email" className="block text-sm font-medium mb-1 text-gray-700">Email *</label>
                        <input
                          id="vendor-email"
                          name="email"
                          type="email"
                          required
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                        />
                      </div>
                      <div>
                        <label htmlFor="vendor-contact-name" className="block text-sm font-medium mb-1 text-gray-700">Contact Name</label>
                        <input
                          id="vendor-contact-name"
                          name="contactName"
                          type="text"
                          value={formData.contactName}
                          onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                        />
                      </div>
                      <div>
                        <label htmlFor="vendor-phone" className="block text-sm font-medium mb-1 text-gray-700">Phone</label>
                        <input
                          id="vendor-phone"
                          name="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                        />
                      </div>
                      <div className="col-span-2">
                        <label htmlFor="vendor-address" className="block text-sm font-medium mb-1 text-gray-700">Address</label>
                        <input
                          id="vendor-address"
                          name="address"
                          type="text"
                          value={formData.address}
                          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                        />
                      </div>
                      <div className="col-span-2">
                        <label htmlFor="vendor-notes" className="block text-sm font-medium mb-1 text-gray-700">Notes</label>
                        <textarea
                          id="vendor-notes"
                          name="notes"
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white"
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Modal Footer */}
                <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Create Vendor
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      <div className="flex-1 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendors.map((vendor) => (
            <div key={vendor.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-white">
              <h3 className="font-semibold text-lg mb-2 text-gray-900">{vendor.name}</h3>
              <div className="space-y-1 text-sm text-gray-600">
                {vendor.email && (
                  <div className="flex items-center gap-2">
                    <Mail size={14} />
                    {vendor.email}
                  </div>
                )}
                {vendor.contactName && (
                  <div className="flex items-center gap-2">
                    <span>{vendor.contactName}</span>
                  </div>
                )}
                {vendor.phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={14} />
                    {vendor.phone}
                  </div>
                )}
                {vendor.address && (
                  <div className="flex items-center gap-2">
                    <MapPin size={14} />
                    {vendor.address}
                  </div>
                )}
                {vendor.notes && (
                  <p className="mt-2 text-xs text-gray-500">{vendor.notes}</p>
                )}
              </div>
              <div className="mt-3 text-xs text-gray-400">
                {vendor.proposals?.length || 0} proposal(s)
              </div>
            </div>
          ))}
        </div>
        {vendors.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No vendors yet. Click "Add Vendor" to get started.
          </div>
        )}
      </div>
    </div>
  );
}
