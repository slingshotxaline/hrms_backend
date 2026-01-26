const fs = require('fs');
const path = require('path');

const files = {
  '../hrms_frontend/src/app/login/page.js': `'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/utils/api';
import Cookies from 'js-cookie';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/auth/login', { email, password });
      Cookies.set('token', data.token);
      Cookies.set('userInfo', JSON.stringify(data));
      router.push('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="w-full max-w-md bg-white p-8 rounded-lg shadow-md">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">HRMS Login</h2>
        {error && <div className="bg-red-100 text-red-700 p-3 mb-4 rounded">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition duration-200"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
`,

  '../hrms_frontend/src/app/dashboard/layout.js': `'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { LayoutDashboard, Users, Calendar, DollarSign, LogOut } from 'lucide-react';

export default function DashboardLayout({ children }) {
  const router = useRouter();

  const handleLogout = () => {
    Cookies.remove('token');
    Cookies.remove('userInfo');
    router.push('/login');
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-md">
        <div className="p-6 border-b">
          <h1 className="text-2xl font-bold text-blue-600">HRMS</h1>
        </div>
        <nav className="p-4 space-y-2">
          <Link href="/dashboard" className="flex items-center space-x-3 p-3 text-gray-700 hover:bg-blue-50 rounded-lg">
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </Link>
          <Link href="/dashboard/employees" className="flex items-center space-x-3 p-3 text-gray-700 hover:bg-blue-50 rounded-lg">
            <Users size={20} />
            <span>Employees</span>
          </Link>
          <Link href="/dashboard/attendance" className="flex items-center space-x-3 p-3 text-gray-700 hover:bg-blue-50 rounded-lg">
            <Calendar size={20} />
            <span>Attendance</span>
          </Link>
          <Link href="/dashboard/payroll" className="flex items-center space-x-3 p-3 text-gray-700 hover:bg-blue-50 rounded-lg">
            <DollarSign size={20} />
            <span>Payroll</span>
          </Link>
        </nav>
        <div className="absolute bottom-0 w-64 p-4 border-t">
          <button
            onClick={handleLogout}
            className="flex items-center space-x-3 p-3 text-red-600 hover:bg-red-50 rounded-lg w-full"
          >
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        {children}
      </main>
    </div>
  );
}
`,

  '../hrms_frontend/src/app/dashboard/page.js': `'use client';
import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';

export default function Dashboard() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const userInfo = Cookies.get('userInfo');
    if (userInfo) {
      setUser(JSON.parse(userInfo));
    }
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Dashboard</h1>
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-semibold mb-4 text-black">Welcome back, {user?.name || 'User'}!</h2>
        <p className="text-gray-600">
          This is your HRMS dashboard overview. Navigate through the sidebar to manage employees, attendance, and payroll.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        <div className="bg-blue-500 text-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold">Total Employees</h3>
            <p className="text-3xl font-bold mt-2">--</p>
        </div>
        <div className="bg-green-500 text-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold">Present Today</h3>
            <p className="text-3xl font-bold mt-2">--</p>
        </div>
        <div className="bg-purple-500 text-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold">Pending Leaves</h3>
            <p className="text-3xl font-bold mt-2">--</p>
        </div>
      </div>
    </div>
  );
}
`,

  '../hrms_frontend/src/app/page.js': `import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24 bg-gradient-to-r from-blue-500 to-purple-600 text-white">
      <h1 className="text-5xl font-bold mb-8">HRMS Portal</h1>
      <p className="text-xl mb-8">Enterprise Human Resource Management System</p>
      <div className="flex space-x-4">
        <Link href="/login" className="bg-white text-blue-600 px-6 py-3 rounded-full font-semibold hover:bg-gray-100 transition">
          Login to Portal
        </Link>
      </div>
    </div>
  );
}
`
};

for (const [filePath, content] of Object.entries(files)) {
  const absolutePath = path.resolve(__dirname, filePath);
  const dir = path.dirname(absolutePath);
  
  if (!fs.existsSync(dir)){
      fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(absolutePath, content);
  console.log(`Created: ${absolutePath}`);
}
