import React, { useState } from 'react';
import { auth, provider } from './firebase'; // Firebase config
import { signInWithPopup } from 'firebase/auth';
import './LoginPage.css';

export default function LoginPage() {
  const [isSignup, setIsSignup] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: ''
  });

  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'

  const toggleMode = () => {
    setIsSignup(!isSignup);
    setFormData({ username: '', password: '', email: '' });
    setMessage('');
    setMessageType('');
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSignup) {
      try {
        const response = await fetch('http://localhost:5000/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: formData.username,
            email: formData.email,
            password: formData.password
          })
        });

        const data = await response.json();
        if (response.ok) {
          setMessage(data.message);
          setMessageType('success');
          setTimeout(() => {
            toggleMode(); // Switch to login after signup success
          }, 1500);
        } else {
          setMessage(data.message || 'Signup failed.');
          setMessageType('error');
        }
      } catch (err) {
        console.error('Signup error:', err);
        setMessage('Error during signup.');
        setMessageType('error');
      }
    } else {
      try {
        const response = await fetch('http://localhost:5000/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: formData.username,
            password: formData.password
          })
        });

        const data = await response.json();
        if (response.ok) {
          setMessage(data.message);
          setMessageType('success');
          setTimeout(() => {
            window.location.href = '/portal';
          }, 1500);
        } else {
          setMessage(data.error || 'Login failed.');
          setMessageType('error');
        }
      } catch (err) {
        console.error('Login error:', err);
        setMessage('Error during login.');
        setMessageType('error');
      }
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      setMessage(`Welcome ${user.displayName}! Redirecting...`);
      setMessageType('success');

      // Optionally: send token or email to backend to create a session
      setTimeout(() => {
        window.location.href = '/portal';
      }, 1500);
    } catch (error) {
      console.error('Google sign-in error:', error);
      setMessage('Google sign-in failed.');
      setMessageType('error');
    }
  };

  return (
    <div className={`login-container ${isSignup ? 'signup-mode' : ''}`}>
      <div className="form-container">
        <h2>{isSignup ? 'Sign Up' : 'Login'}</h2>

        {message && (
          <div className={`message ${messageType}`}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isSignup && (
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          )}
          <input
            type="text"
            name="username"
            placeholder="Username"
            value={formData.username}
            onChange={handleChange}
            required
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            required
          />
          <button type="submit">{isSignup ? 'Sign Up' : 'Login'}</button>
        </form>

        <button onClick={handleGoogleSignIn} className="google-signin">
          Sign in with Google
        </button>

        <p onClick={toggleMode} className="toggle">
          {isSignup ? 'Already have an account? Login' : "Don't have an account? Sign Up"}
        </p>
      </div>

      <div id="confetti" className="confetti"></div>
    </div>
  );
}