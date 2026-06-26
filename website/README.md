# Chandra Hi Tech ENT Hospital Website

A professional, modern website for Chandra Hi Tech ENT Hospital in Jhansi, showcasing comprehensive ENT healthcare services by Dr. Anchal Jain, ENT Specialist.

## 🏥 About

This website serves as the digital presence for Chandra Hi Tech ENT Hospital, providing information about:
- Hospital services and specialties
- Department information
- Doctor profiles and expertise
- Appointment booking
- Contact information
- Integration with the hospital's pharmacy inventory system

## 📁 Project Structure

```
website/
├── index.html          # Homepage
├── about.html          # About Us page
├── services.html       # Services page
├── departments.html    # Departments page
├── contact.html        # Contact & Appointment page
├── styles.css          # Main stylesheet
├── script.js           # JavaScript functionality
└── README.md           # This file
```

## ✨ Features

### Homepage
- Hero section with call-to-action
- Quick info cards (24/7 Emergency, Expert Doctors, etc.)
- Services overview
- Why choose us section
- Patient testimonials
- Direct link to pharmacy portal

### Services Page
- Comprehensive ENT services:
  - Ear Care
  - Nose Care
  - Throat Care
  - Diagnostics
  - Surgery
  - Pediatric ENT
- Detailed service descriptions
- Treatment procedures

### Departments Page
- ENT Department
- Audiology Department
- Surgery Department
- Emergency Department
- Pharmacy Department
- Diagnostic Department
- Department hours and contact info

### About Page
- Hospital mission, vision, and values
- Why choose us
- Facilities overview
- Commitment to patients
- Achievements
- Advanced technology
- Patient care philosophy

### Contact Page
- Contact information cards
- Appointment booking form
- Quick contact options (Call, WhatsApp, Email)
- Google Maps integration
- FAQ section
- Emergency contact banner

## 🎨 Design Features

- **Modern & Professional**: Clean, medical-grade design
- **Responsive**: Works on all devices (desktop, tablet, mobile)
- **Accessible**: ARIA labels and semantic HTML
- **Fast Loading**: Optimized images and code
- **SEO Friendly**: Proper meta tags and structure
- **Color Scheme**: 
  - Primary: #07856f (Medical Green)
  - Secondary: #0f62fe (Trust Blue)
  - Accent: #f59e0b (Warm Orange)

## 🚀 Technologies Used

- **HTML5**: Semantic markup
- **CSS3**: Modern styling with CSS Grid and Flexbox
- **JavaScript**: Interactive functionality
- **Google Fonts**: Inter font family
- **Google Maps**: Location integration

## 📱 Responsive Breakpoints

- Desktop: 1024px and above
- Tablet: 768px - 1023px
- Mobile: 320px - 767px

## 🔗 Integration

The website integrates with the hospital's existing pharmacy inventory system:
- Direct link to pharmacy portal in navigation
- Pharmacy department information
- Digital inventory management mention

## 🌐 Pages Overview

### 1. Homepage (index.html)
- Welcome message
- Quick access to services
- Hospital highlights
- Patient testimonials
- Call-to-action sections

### 2. About Us (about.html)
- Hospital history and background
- Mission, vision, and values
- Why choose us
- Facilities and technology
- Achievements and statistics

### 3. Services (services.html)
- Detailed service descriptions
- Treatment procedures
- Specialized care information
- Service-specific features

### 4. Departments (departments.html)
- Department-wise information
- Services offered by each department
- Department hours
- Contact information

### 5. Contact (contact.html)
- Multiple contact methods
- Appointment booking form
- Location map
- FAQ section
- Emergency contact

## 📋 Features Implemented

### Interactive Elements
- ✅ Mobile-responsive navigation
- ✅ Smooth scrolling
- ✅ Form validation
- ✅ Notification system
- ✅ Back to top button
- ✅ Scroll animations
- ✅ Active navigation highlighting

### Forms
- ✅ Appointment booking form
- ✅ Client-side validation
- ✅ Phone number formatting
- ✅ Date picker with minimum date
- ✅ Success/error notifications

### Accessibility
- ✅ Semantic HTML
- ✅ ARIA labels
- ✅ Keyboard navigation
- ✅ Alt text for images
- ✅ Focus indicators

## 🎯 Key Sections

### Hero Section
- Eye-catching gradient background
- Clear value proposition
- Dual call-to-action buttons

### Quick Info Cards
- 24/7 Emergency services
- Expert doctors
- Advanced technology
- In-house pharmacy

### Services Grid
- 6 main service categories
- Icon-based visual representation
- Hover effects
- Learn more links

### Testimonials
- Patient reviews
- Star ratings
- Social proof

### Call-to-Action
- Strategic placement
- Multiple contact options
- Emergency contact prominence

## 🔧 Customization

### Colors
Edit CSS variables in `styles.css`:
```css
:root {
    --primary-color: #07856f;
    --secondary-color: #0f62fe;
    --accent-color: #f59e0b;
}
```

### Content
- Update text in HTML files
- Replace images in `img` tags
- Modify contact information

### Styling
- All styles in `styles.css`
- Organized by sections
- Responsive design included

## 📞 Contact Information

**Hospital Details:**
- Name: Chandra Hi Tech ENT Hospital
- Doctor: Dr. Anchal Jain (ENT Specialist)
- Location: Gate No. 2-3, Kanpur - Jhansi Highway, Opposite Medical College, Near Jamuna Gas Godown, Bundelkhand University, Jhansi, Uttar Pradesh - 284128
- Online Booking: https://book.healthplix.com/dr-dr--anchal-jain-ear--nose---throat-specialist-opp--medical-college-jhansi
- Profile: https://www.lybrate.com/jhansi/doctor/dr-anchal-jain-ear-nose-throat-ent-specialist
- Directions: https://www.google.com/maps/dir//gate+number+2-3,+Kanpur+-+Jhansi+Hwy,+opposite+medical+college,+near+jamuna+gas+godown,+Bundelkhand+University,+Jhansi,+Uttar+Pradesh+284128

**Working Hours:**
- By Appointment (Book online or walk-in)

## 🚀 Running the Website

### Method 1: Using Python Server (Recommended)
1. Open terminal in the `website` directory
2. Run the server:
   ```bash
   python3 server.py
   ```
3. Open your browser and visit: http://localhost:8000
4. Press Ctrl+C to stop the server

### Method 2: Direct File Access
1. Open `index.html` in a web browser
2. Navigate through all pages
3. Test forms and interactive elements

**Note:** Using the Python server (Method 1) is recommended as it properly serves all files and simulates a real web server environment.

### Web Hosting
1. Upload all files to web server
2. Ensure proper file permissions
3. Configure domain and SSL
4. Test all links and forms

### Recommended Hosting
- Netlify (Free tier available)
- Vercel (Free tier available)
- GitHub Pages (Free)
- Traditional web hosting

## 📈 Future Enhancements

Potential additions:
- [ ] Online appointment booking backend
- [ ] Patient portal integration
- [ ] Blog section for health tips
- [ ] Doctor profiles with photos
- [ ] Live chat support
- [ ] Multi-language support
- [ ] Patient testimonial submission form
- [ ] Newsletter subscription
- [ ] Health resources library
- [ ] Insurance information

## 🔒 Security Considerations

- Form validation (client-side implemented)
- HTTPS recommended for production
- Secure form submission backend needed
- Privacy policy and terms of service
- GDPR compliance for patient data

## 📝 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## 🤝 Integration with Pharmacy System

The website seamlessly integrates with the existing pharmacy inventory and billing system:
- Navigation link to pharmacy portal
- Pharmacy department information
- Digital inventory system mention
- Unified branding and design

## 📄 License

© 2026 Chandra Hi Tech ENT Hospital Jhansi. All rights reserved.

## 👨‍💻 Development

This website was developed as a comprehensive digital presence for Chandra Hi Tech ENT Hospital, focusing on:
- User experience
- Professional medical design
- Mobile responsiveness
- Accessibility
- Integration with existing systems

---

**For support or inquiries:**
- Email: info@chandrahitech.com
- Phone: +91 98765 43210